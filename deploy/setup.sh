#!/usr/bin/env bash
# Maltose deploy environment setup — interactive one-shot configurator (ADR-0033).
#
# Detects the distro, installs runtimes (Node/pnpm/pm2), creates the deploy
# user + target dirs, installs the deploy scripts, generates an SSH key, and
# prints the GitHub secrets/environment to configure. Run as a user with sudo.
#
# Usage: bash deploy/setup.sh
set -euo pipefail

# ── Colors / helpers ────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[setup]${NC} $*"; }
ok()    { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
die()   { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }
ask()   { # ask <prompt> <default>
  local prompt="${1}" default="${2:-}"
  if [ -n "$default" ]; then prompt="${prompt} [${default}]"; fi
  read -r -p "$prompt: " ans
  echo "${ans:-$default}"
}
yesno() { # yesno <prompt> (default yes)
  read -r -p "$* [Y/n] " ans
  case "${ans:-y}" in y|Y|yes|Yes) return 0;; *) return 1;; esac
}

# confirm_yes <prompt> — destructive-action guard: only literal "YES" proceeds.
confirm_yes() {
  read -r -p "$* (type YES to confirm) " ans
  [ "$ans" = "YES" ]
}

# skip_or_cover <name> — asks the user whether an existing item should be
# skipped (default) or overwritten. Returns 0=skip, 1=cover.
skip_or_cover() {
  read -r -p "$1 already exists — skip or cover? [s/C] " ans
  case "${ans:-s}" in
    s|S|skip|Skip) return 0;;
    c|C|cover|Cover) return 1;;
    *) warn "Unrecognized '${ans}' — treating as skip"; return 0;;
  esac
}

# choose_machine_role — which environment does THIS machine serve? This drives
# which dirs/keys get created so a single box or split boxes both work.
# Returns "production" | "staging" | "both".
choose_machine_role() {
  read -r -p "This machine serves — production, staging, or both? [b] " ans
  case "${ans:-b}" in
    p|P|prod|production|Production) echo "production";;
    s|S|stage|staging|Staging) echo "staging";;
    b|B|both|Both) echo "both";;
    *) warn "Unrecognized '${ans}' — treating as both"; echo "both";;
  esac
}

# ── 0. Detect distro / package manager ─────────────────────────────────────
detect_pkg_mgr() {
  if command -v apt-get >/dev/null 2>&1; then echo "apt";
  elif command -v dnf >/dev/null 2>&1; then echo "dnf";
  elif command -v pacman >/dev/null 2>&1; then echo "pacman";
  elif command -v apk >/dev/null 2>&1; then echo "apk";
  else echo "unknown"; fi
}

# ── 1. Install runtimes (Node 22 + pnpm + pm2 + rsync) ──────────────────────
install_runtime() {
  local pm="$1"

  # Check each dependency individually; report which are present/missing.
  local missing=()
  for cmd in node pnpm pm2 rsync; do
    if command -v "$cmd" >/dev/null 2>&1; then
      ok "${cmd} present: $(command -v "$cmd")"
    else
      warn "${cmd} missing"
      missing+=("$cmd")
    fi
  done

  if [ ${#missing[@]} -eq 0 ]; then
    ok "All runtimes already installed: $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v 2>/dev/null | head -1)"
    return 0
  fi

  # rsync is only available via distro packages (not npm) — if missing, the
  # distro install path must run even when node is already present.
  local need_distro=0
  if ! command -v rsync >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    need_distro=1
  fi

  if [ "$need_distro" = "1" ]; then
    if ! yesno "Install Node.js + rsync via ${pm} (needs sudo)?"; then
      warn "Skipping package install. Ensure node/rsync exist manually, then rerun."
      return 1
    fi
    info "Installing Node.js + rsync via ${pm}..."
    case "$pm" in
      apt)
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs rsync
        ;;
      dnf)
        sudo dnf install -y nodejs rsync
        ;;
      pacman)
        sudo pacman -S --noconfirm nodejs rsync
        ;;
      apk)
        sudo apk add --no-cache nodejs rsync
        ;;
      unknown)
        warn "Unsupported distro — please install manually:"
        warn "  Node.js 22, pnpm, pm2, rsync"
        warn "  (see https://nodejs.org and https://pnpm.io/installation)"
        if ! yesno "Continue after manual install (skip dependency step)?"; then return 1; fi
        command -v node >/dev/null || die "node not found after manual install"
        ;;
    esac
  fi

  # pnpm/pm2 via npm — only when node is present (distro packages don't ship them).
  if ! command -v pnpm >/dev/null 2>&1 || ! command -v pm2 >/dev/null 2>&1; then
    if command -v node >/dev/null 2>&1; then
      if yesno "Install pnpm + pm2 globally via npm (needs sudo)?"; then
        command -v pnpm >/dev/null 2>&1 || { sudo npm install -g pnpm; ok "pnpm installed"; }
        command -v pm2 >/dev/null 2>&1 || { sudo npm install -g pm2; ok "pm2 installed"; }
      else
        warn "Skipping pnpm/pm2 — ensure they exist before deploying."
      fi
    else
      warn "node missing — cannot install pnpm/pm2 via npm yet."
    fi
  fi

  if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1 && command -v rsync >/dev/null 2>&1; then
    ok "Runtime ready: $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v 2>/dev/null | head -1)"
  else
    warn "Runtime incomplete. Present: node=$(command -v node || echo no) pnpm=$(command -v pnpm || echo no) pm2=$(command -v pm2 || echo no) rsync=$(command -v rsync || echo no)"
    warn "Re-run setup after providing missing pieces."
  fi
}

# ── 2. Deploy user + target dirs ────────────────────────────────────────────
setup_user_and_dirs() {
  local user="$1" prod_dir="$2" stage_dir="$3" role="${4:-both}"

  # Create the deploy user if it does not exist (needs sudo). Users are never
  # overwritten (deleting a user would break its files/permissions) — only
  # skip or cancel.
  if ! id "$user" >/dev/null 2>&1; then
    if yesno "Create system user '${user}' (non-root, no login)?"; then
      sudo useradd -r -m -s /bin/bash "$user" || sudo useradd -m -s /bin/bash "$user"
      ok "User '${user}' created"
    else
      warn "Will use existing user '${user}' — ensure it can sudo to install scripts."
    fi
  else
    warn "User '${user}' already exists"
    if yesno "Continue with existing user '${user}' (no changes to it)?"; then
      ok "Using existing user '${user}'"
    else
      die "Aborted — user '${user}' already exists and you chose not to continue."
    fi
  fi

  # Target dirs for the selected role. Each box only creates what it serves.
  local dirs=()
  case "$role" in
    production) dirs=("$prod_dir");;
    staging)    dirs=("$stage_dir");;
    *)          dirs=("$prod_dir" "$stage_dir");;
  esac

  for d in "${dirs[@]}"; do
    if ! echo "$d" | grep -q '^/'; then warn "Target dir not absolute: ${d} — skipping"; continue; fi

    # Detect cross-user home path (e.g. /home/other/...) → warn about 700 perms.
    if echo "$d" | grep -q "^/home/[^/]\+"; then
      home_user="$(echo "$d" | cut -d/ -f3)"
      if [ "$home_user" != "$user" ]; then
        warn "Target '${d}' is inside another user's home (/home/${home_user})."
        warn "  That home is usually 700 — '${user}' cannot traverse it. Either:"
        warn "    - chmod 711 /home/${home_user}   (allow traverse, no listing)"
        warn "    - chown -R ${user}:${user} ${d}  (give the dir to deploy user)"
        warn "    - or use a non-home path like /var/www/maltose (recommended)"
      fi
    fi

    if [ ! -d "$d" ]; then
      if yesno "Create target dir ${d} (as ${user})?"; then
        sudo -u "$user" mkdir -p "$d" 2>/dev/null \
          || { sudo mkdir -p "$d" && sudo chown "$user":"$user" "$d"; }
        ok "Created ${d}"
      fi
    else
      warn "Target dir exists: ${d}"
      if skip_or_cover "Target dir ${d}"; then
        ok "Keeping existing dir ${d}"
      else
        # Cover = wipe contents and recreate. Guarded by literal YES to avoid
        # destroying a live deployment on a stray keystroke.
        if confirm_yes "Wipe and recreate ${d}? This DELETES its contents"; then
          sudo rm -rf "${d:?}"
          sudo -u "$user" mkdir -p "$d" 2>/dev/null \
            || { sudo mkdir -p "$d" && sudo chown "$user":"$user" "$d"; }
          ok "Recreated ${d} (cleared)"
        else
          warn "Keeping ${d} as-is (no wipe)"
        fi
      fi
    fi
  done

  # Deploy scripts dir.
  sudo -u "$user" mkdir -p "/home/${user}/bin" 2>/dev/null || sudo mkdir -p "/home/${user}/bin"
}

# ── 3. Install deploy scripts ───────────────────────────────────────────────
install_scripts() {
  local user="$1" script_dir="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
  local bin="/home/${user}/bin"

  sudo -u "$user" mkdir -p "${bin}" 2>/dev/null || sudo mkdir -p "${bin}"

  local exists=0
  for f in deploy.sh deploy-gate.sh; do
    [ -f "${bin}/${f}" ] && exists=1
  done

  if [ "$exists" = "1" ]; then
    warn "Deploy scripts already present in ${bin}"
    if skip_or_cover "Deploy scripts (${bin})"; then
      ok "Keeping existing scripts"
      return 0
    fi
    info "Overwriting deploy scripts with latest"
  else
    info "Installing deploy scripts from ${script_dir} → ${bin}"
  fi

  sudo cp "${script_dir}/deploy.sh" "${script_dir}/deploy-gate.sh" "${bin}/"
  sudo chmod +x "${bin}/deploy.sh" "${bin}/deploy-gate.sh"
  sudo chown -R "$user":"$user" "${bin}"
  ok "Scripts installed (deploy.sh, deploy-gate.sh)"
}

# ── 4. SSH keys (dual-key per environment) + authorized_keys ────────────────
# Generates two restricted keys: production (PRODUCTION_SSH_KEY) and staging
# (STAGING_SSH_KEY). Both install into the same deploy user's authorized_keys
# (same machine or different machines — each machine runs setup.sh once), but
# the private keys go to separate GitHub environment secrets for isolation.

# gen_key <name> <comment> — generate-or-skip-or-cover a single keypair.
# <comment> doubles as the stable marker embedded in the key line, so
# authorized_keys replacement can drop exactly this key.
gen_key() {
  local name="$1" comment="$2"
  local keyfile="/tmp/${name}_ed25519"

  if [ -f "${keyfile}" ]; then
    warn "Key ${name} already exists (${keyfile})"
    if skip_or_cover "SSH key ${name}"; then
      ok "Keeping existing ${name} key"
      return 0
    fi
    info "Regenerating ${name} key — OLD private key becomes invalid!"
    rm -f "${keyfile}" "${keyfile}.pub"
  fi

  ssh-keygen -t ed25519 -N "" -C "${comment}" -f "${keyfile}" >/dev/null
  ok "Key ${name} generated"
}

# install_pub <user> <name> <marker> — append (or replace) the CI key line.
# <marker> is the key's comment, stable inside the authorized_keys line.
install_pub() {
  local user="$1" name="$2" marker="$3"
  local keyfile="/tmp/${name}_ed25519"
  local pub restricted
  pub="$(cat "${keyfile}.pub")"
  # Prepend the command whitelist — this is the core restriction (ADR-0033).
  restricted="command=\"/home/${user}/bin/deploy-gate.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding ${pub}"

  sudo -u "$user" mkdir -p "/home/${user}/.ssh"
  sudo -u "$user" sh -c "umask 077 && touch /home/${user}/.ssh/authorized_keys"
  # Replace only this key's line (matched by its comment marker); never clobber
  # the user's other keys.
  sudo -u "$user" sh -c "grep -v '${marker}' /home/${user}/.ssh/authorized_keys > /tmp/ak.$$ 2>/dev/null || true; mv /tmp/ak.$$ /home/${user}/.ssh/authorized_keys"
  echo "${restricted}" | sudo tee -a "/home/${user}/.ssh/authorized_keys" >/dev/null
  sudo -u "$user" chmod 700 "/home/${user}/.ssh"
  sudo -u "$user" chmod 600 "/home/${user}/.ssh/authorized_keys"
}

setup_ssh() {
  local user="$1" role="${2:-both}"

  if ! yesno "Generate restricted deploy SSH key(s) for this machine's role?"; then
    warn "Skipping keygen — you must provide your own keys in GitHub secrets."
    return 0
  fi

  # Generate/install only the key(s) this machine actually needs. On a split
  # setup each box generates only its own key; on a single box both are made.
  case "$role" in
    production)
      gen_key "maltose_prod" "maltose-ci-deploy-prod"
      install_pub "$user" "maltose_prod" "maltose-ci-deploy-prod"
      ;;
    staging)
      gen_key "maltose_dev" "maltose-ci-deploy-dev"
      install_pub "$user" "maltose_dev" "maltose-ci-deploy-dev"
      ;;
    *)
      gen_key "maltose_prod" "maltose-ci-deploy-prod"
      gen_key "maltose_dev" "maltose-ci-deploy-dev"
      install_pub "$user" "maltose_prod" "maltose-ci-deploy-prod"
      install_pub "$user" "maltose_dev" "maltose-ci-deploy-dev"
      ;;
  esac

  ok "SSH key(s) installed (restricted)."
  echo
  if [ "$role" != "staging" ]; then
    echo "──────────────────────────────────────────────────────────────"
    echo " PRODUCTION private key → Environment 'production' secret  PRODUCTION_SSH_KEY:"
    echo "──────────────────────────────────────────────────────────────"
    cat /tmp/maltose_prod_ed25519
    echo
  fi
  if [ "$role" != "production" ]; then
    echo "──────────────────────────────────────────────────────────────"
    echo " STAGING private key   → Environment 'staging' secret      STAGING_SSH_KEY:"
    echo "──────────────────────────────────────────────────────────────"
    cat /tmp/maltose_dev_ed25519
    echo
  fi
  echo "──────────────────────────────────────────────────────────────"
  echo " (shown once — copy each into its environment secret)"
}

# ── 5. Print GitHub configuration ───────────────────────────────────────────
print_github_guide() {
  local prod_host stage_host prod_port stage_port prod_dir stage_dir user role
  prod_host="$(ask 'Production host (PRODUCTION_HOST)' "${PROD_HOST:-}")"
  prod_port="$(ask 'Production SSH port (PRODUCTION_SSH_PORT)' "${PROD_PORT:-22}")"
  stage_host="$(ask 'Staging host (STAGING_HOST)' "${STAGE_HOST:-}")"
  stage_port="$(ask 'Staging SSH port (STAGING_SSH_PORT)' "${STAGE_PORT:-22}")"
  prod_dir="${1}"; stage_dir="${2}"; user="${3}"; role="${4:-both}"

  echo
  echo "──────────────────────────────────────────────────────────────"
  echo " GITHUB CONFIGURATION (manual — copy into GitHub Settings)"
  echo "──────────────────────────────────────────────────────────────"
  if [ "$role" != "staging" ]; then
    echo "Environment 'production' (Settings → Environments → production):"
    echo "  VARIABLE  PRODUCTION_HOST     ${prod_host}"
    echo "  VARIABLE  PRODUCTION_SSH_PORT ${prod_port}"
    echo "  VARIABLE  PRODUCTION_USER     ${user}"
    echo "  VARIABLE  PRODUCTION_PATH     ${prod_dir}"
    echo "  SECRET    PRODUCTION_SSH_KEY  <production private key printed above>"
    echo
  fi
  if [ "$role" != "production" ]; then
    echo "Environment 'staging':"
    echo "  VARIABLE  STAGING_HOST     ${stage_host}"
    echo "  VARIABLE  STAGING_SSH_PORT ${stage_port}"
    echo "  VARIABLE  STAGING_USER     ${user}"
    echo "  VARIABLE  STAGING_PATH     ${stage_dir}"
    echo "  SECRET    STAGING_SSH_KEY  <staging private key printed above>"
    echo
  fi
  echo "Optional: in Environment 'production' → 'Required reviewers' to"
  echo "require manual approval before production deploys."
  echo "──────────────────────────────────────────────────────────────"
}

# ── Main ───────────────────────────────────────────────────────────────────
main() {
  echo "Maltose deploy setup (ADR-0033) — interactive one-shot config"
  echo

  PM="$(detect_pkg_mgr)"
  info "Detected package manager: ${PM}"
  install_runtime "$PM"

  local role user prod_dir stage_dir
  role="$(choose_machine_role)"
  info "This machine serves: ${role}"

  user="$(ask 'Deploy user' "${DEPLOY_USER:-deploy}")"
  prod_dir="$(ask 'Production target dir' "${PRODUCTION_PATH:-/var/www/maltose/prod}")"
  stage_dir="$(ask 'Staging target dir' "${STAGING_PATH:-/var/www/maltose/dev}")"

  setup_user_and_dirs "$user" "$prod_dir" "$stage_dir" "$role"
  install_scripts "$user"
  setup_ssh "$user" "$role"
  print_github_guide "$prod_dir" "$stage_dir" "$user" "$role"

  ok "Setup complete. Configure GitHub secrets per the guide above, then push to main/develop."
}

main "$@"
