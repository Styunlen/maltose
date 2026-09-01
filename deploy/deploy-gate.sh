#!/usr/bin/env bash
# Maltose SSH command gate (ADR-0033).
#
# This is the ONLY command the restricted deploy SSH key can run: it is wired
# via authorized_keys `command="/home/<user>/.local/bin/maltose-deploy/deploy-gate.sh"`.
# OpenSSH replaces whatever the client sends with this script and puts the
# client's original command line in $SSH_ORIGINAL_COMMAND, so the key can never
# open a shell. We accept a fixed vocabulary and reject everything else.
set -euo pipefail

# Bootstrap the toolchain PATH (nvm/fnm/volta/asdf/system) — see env.sh.
# shellcheck source=env.sh
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"

DEPLOY_USER="$(whoami)"
DEPLOY_BIN="/home/${DEPLOY_USER}/.local/bin/maltose-deploy"

# The client's command as OpenSSH captured it (e.g. "rsync --server ..." or
# "deploy production /var/www/maltose"). Positional args ($@) are the gate's
# own — not trusted.
OP="${SSH_ORIGINAL_COMMAND:-}"

# rsync upload from CI (easingthemes/ssh-deploy): the client drives the rsync
# protocol with `rsync --server <options> . <target>`. We cannot parse it here
# safely; exec rsync with the client's args verbatim. The deploy user's home is
# the only writable area, which bounds what rsync can touch.
case "${OP}" in
  rsync*)
    # shellcheck disable=SC2086
    exec /usr/bin/rsync ${OP#rsync }
    ;;
esac

# Explicit deploy triggers: "deploy <production|staging> <target-dir>".
# The target dir comes from GitHub secret; validate it is an absolute path with
# no traversal so the gate cannot be tricked into operating outside it.
case "${OP}" in
  "deploy production "*|"deploy staging "*)
    set -- ${OP}
    ENV_NAME="$2"
    TARGET_DIR="$3"
    case "${TARGET_DIR}" in
      /*) ;; # absolute path required
      *)
        echo "[deploy-gate] rejected non-absolute target: ${TARGET_DIR}" >&2
        exit 1
        ;;
    esac
    case "${TARGET_DIR}" in
      *"../"*|*"/..")
        echo "[deploy-gate] rejected path traversal: ${TARGET_DIR}" >&2
        exit 1
        ;;
    esac
    export APP_NAME="maltose-${ENV_NAME}"
    exec "${DEPLOY_BIN}/deploy.sh" "${ENV_NAME}" "${TARGET_DIR}"
    ;;
esac

echo "[deploy-gate] rejected command: ${OP}" >&2
exit 1
