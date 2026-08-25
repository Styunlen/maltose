#!/usr/bin/env bash
# Maltose toolchain PATH bootstrap (ADR-0033).
#
# SSH `authorized_keys` command= runs a non-interactive shell whose PATH is the
# system default — it does NOT load .bashrc/.zshrc/.profile, so per-user
# toolchains (nvm/fnm/volta/asdf) are invisible. This file locates node/pm2
# regardless of how they were installed, so the deploy scripts are portable
# across environments.
#
# Usage: source it from deploy.sh / deploy-gate.sh before invoking pnpm/pm2.
# Override: set DEPLOY_TOOLCHAIN_PATH to force a specific toolchain bin dir.

# 1. Explicit override — validate, else warn and fall through to probing.
#    A bogus path must not silently kill the deploy with a dead PATH.
if [ -n "${DEPLOY_TOOLCHAIN_PATH:-}" ]; then
  if [ -x "${DEPLOY_TOOLCHAIN_PATH}/node" ]; then
    case ":$PATH:" in
      *":${DEPLOY_TOOLCHAIN_PATH}:"*) ;;
      *) export PATH="${DEPLOY_TOOLCHAIN_PATH}:${PATH}" ;;
    esac
    return 0 2>/dev/null || exit 0
  fi
  echo "[env.sh] warning: DEPLOY_TOOLCHAIN_PATH=${DEPLOY_TOOLCHAIN_PATH} has no executable node — falling back to auto-probe" >&2
fi

# Helper: pick the newest version among matched node bin dirs. Comparison runs
# on the version dir name (vX.Y.Z) — sorting full paths breaks because the
# leading path prefix is not numeric, and basename of a ".../bin" path is "bin".
# GNU `sort -V` is Linux-only (macOS 13+ has it but older don't); nvm itself
# uses this -t. -k form so the same script works everywhere.
# Call with the glob QUOTED so it expands inside the function, not before.
_latest_node_bin() {
  local best="" cand cand_name
  # shellcheck disable=SC2086
  for cand in $1; do
    [ -x "$cand/node" ] || continue
    cand_name="$(basename "$(dirname "$cand")")"
    if [ -z "$best" ]; then
      best="$cand"
    elif [ "$(printf '%s\n%s\n' "$(basename "$(dirname "$best")")" "$cand_name" \
          | sort -t. -u -k 1.2,1n -k 2,2n -k 3,3n | tail -n 1)" = "$cand_name" ]; then
      best="$cand"
    fi
  done
  printf '%s\n' "$best"
}

# 2. nvm: honor the user's `default` alias if set (it's a plain-text file
#    containing e.g. "v26.9.0", "18", "node", or "system"). When no default
#    exists, fall back to the highest installed version instead of the first
#    lexicographic match (which would wrongly pick v18 over v26).
nvm_node_bin=""
if [ -d "$HOME/.nvm/versions/node" ]; then
  nvm_default=""
  if [ -s "$HOME/.nvm/alias/default" ]; then
    nvm_default="$(sed -e 's/#.*//' -e '/^[[:space:]]*$/d' "$HOME/.nvm/alias/default" | head -n 1)"
  fi
  case "$nvm_default" in
    "")
      # No default alias → newest installed version.
      nvm_node_bin="$(_latest_node_bin "$HOME/.nvm/versions/node/v*/bin")"
      ;;
    system)
      # Explicit system node — skip nvm entirely, fall through to probe below.
      nvm_node_bin=""
      ;;
    node|stable|unstable)
      # Implicit aliases resolve to the latest installed version.
      nvm_node_bin="$(_latest_node_bin "$HOME/.nvm/versions/node/v*/bin")"
      ;;
    v*)
      # Full version pin (e.g. "v26.9.0") → use that exact dir if installed.
      [ -x "$HOME/.nvm/versions/node/$nvm_default/bin/node" ] \
        && nvm_node_bin="$HOME/.nvm/versions/node/$nvm_default/bin"
      ;;
    *)
      # Partial version (e.g. "18" or "18.20") → newest matching major/minor.
      nvm_node_bin="$(_latest_node_bin "$HOME/.nvm/versions/node/v${nvm_default}*/bin")"
      ;;
  esac
  if [ -n "$nvm_node_bin" ] && [ -x "$nvm_node_bin/node" ]; then
    case ":$PATH:" in
      *":$nvm_node_bin:"*) ;;
      *) export PATH="$nvm_node_bin:$PATH" ;;
    esac
  fi
fi

# 3. Probe remaining per-user version managers + pnpm global bin + system
#    locations, in order. First dir that contains a `node` binary wins.
for dir in \
  "$HOME/.local/bin" \
  "$HOME/.local/share/pnpm/bin" \
  "$HOME/.volta/bin" \
  "$HOME/.fnm" \
  "$HOME/.asdf/shims" \
  /usr/local/bin
do
  if [ -x "$dir/node" ]; then
    case ":$PATH:" in
      *":$dir:"*) ;;
      *) export PATH="$dir:$PATH" ;;
    esac
    break
  fi
done

# 3b. pnpm global bin: tools installed with `pnpm add -g` (e.g. pm2) live in a
#     separate dir, NOT next to node — so the node-anchored probe above can't
#     see them. We derive it from pnpm's OWN default (avoiding `pnpm bin -g`,
#     which ERRORS with exit 1 whenever the bin dir is not already on PATH —
#     precisely our situation — and `pnpm config get global-bin-dir`, which
#     returns literal "undefined" when unset because pnpm only reports
#     explicitly-set values). pnpm 11 default: <home>/bin where <home> =
#     $PNPM_HOME -> $XDG_DATA_HOME/pnpm -> ~/.local/share/pnpm (Darwin:
#     ~/Library/pnpm). We take the explicit config value first when set.
pnpm_global_bin=""
if command -v pnpm >/dev/null 2>&1; then
  pnpm_cfg="$(pnpm config get global-bin-dir 2>/dev/null || true)"
  case "$pnpm_cfg" in
    ""|undefined) ;;
    *) pnpm_global_bin="$pnpm_cfg" ;;
  esac
fi
if [ -z "$pnpm_global_bin" ]; then
  pnpm_home="${PNPM_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/pnpm}"
  pnpm_global_bin="$pnpm_home/bin"
fi
if [ -d "$pnpm_global_bin" ]; then
  case ":$PATH:" in
    *":$pnpm_global_bin:"*) ;;
    *) export PATH="$pnpm_global_bin:$PATH" ;;
  esac
fi

# 5. Debug summary — always print to stderr (surfaces in deploy errors);
#    with DEPLOY_DEBUG=1 also append a trace file next to this script.
if [ "${DEPLOY_DEBUG:-0}" = "1" ]; then
  {
    echo "===== env.sh debug $(date -u +%FT%TZ) ====="
    echo "HOME=$HOME"
    echo "DEPLOY_TOOLCHAIN_PATH=${DEPLOY_TOOLCHAIN_PATH:-<unset>}"
    echo "nvm_node_bin=${nvm_node_bin:-<none>}"
    echo "pnpm_global_bin=${pnpm_global_bin:-<none>}"
    echo "node=$(command -v node 2>/dev/null || echo MISSING) ($(node -v 2>/dev/null || echo '?') 2>/dev/null)"
    echo "pnpm=$(command -v pnpm 2>/dev/null || echo MISSING)"
    echo "pm2=$(command -v pm2 2>/dev/null || echo MISSING)"
    echo "PATH=$PATH"
    echo "===== end ====="
  } >&2
  _env_trace="${DEPLOY_BIN:-$(dirname "${BASH_SOURCE[0]}")}/env-debug.log"
  {
    echo "===== env.sh debug $(date -u +%FT%TZ) ====="
    echo "HOME=$HOME"
    echo "DEPLOY_TOOLCHAIN_PATH=${DEPLOY_TOOLCHAIN_PATH:-<unset>}"
    echo "nvm_node_bin=${nvm_node_bin:-<none>}"
    echo "pnpm_global_bin=${pnpm_global_bin:-<none>}"
    echo "node=$(command -v node 2>/dev/null || echo MISSING)"
    echo "pnpm=$(command -v pnpm 2>/dev/null || echo MISSING)"
    echo "pm2=$(command -v pm2 2>/dev/null || echo MISSING)"
    echo "PATH=$PATH"
    echo "===== end ====="
  } >> "${_env_trace}" 2>/dev/null || true
  echo "[env.sh] debug trace written to ${_env_trace}" >&2
fi

# 4. Fall back to sourcing the manager init scripts (defines nvm/volta fns).
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh"
  elif [ -s "$HOME/.volta/bin/volta" ]; then
    export PATH="$HOME/.volta/bin:$PATH"
  elif [ -s "$HOME/.asdf/asdf.sh" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.asdf/asdf.sh"
  fi
fi
