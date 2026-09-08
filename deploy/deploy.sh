#!/usr/bin/env bash
# Maltose server deploy script (ADR-0033).
# Invoked by deploy-gate.sh after CI rsyncs artifacts into the target dir.
# The target dir comes from GitHub secret (passed as $2 by the gate), so the
# server works in exactly the dir the artifacts were synced into.
# Usage: deploy.sh <production|staging> <target-dir>
set -euo pipefail

# Bootstrap the toolchain PATH (nvm/fnm/volta/asdf/system) — see env.sh.
# shellcheck source=env.sh
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"

ENV_NAME="${1:?usage: deploy.sh <production|staging> <target-dir>}"
TARGET_DIR="${2:?usage: deploy.sh <production|staging> <target-dir>}"

if [ ! -d "${TARGET_DIR}" ]; then
  echo "[deploy:${ENV_NAME}] target dir missing: ${TARGET_DIR}" >&2
  exit 1
fi
cd "${TARGET_DIR}"

echo "[deploy:${ENV_NAME}] installing production deps"
if [ -f package.json ]; then
  # CI=true makes pnpm treat this as a CI environment (pnpm `ci` setting,
  # v10.12.1+). Without a TTY pnpm otherwise aborts when it decides the
  # modules dir must be rebuilt (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
  # Per-command env keeps this scoped to the install step only.
  CI=true pnpm install --prod --frozen-lockfile || CI=true pnpm install --prod
fi

# Pick the pm2 app name per environment (maltose-production / maltose-staging).
# ecosystem.config.cjs declares both apps; APP_NAME is set by the deploy gate.
APP_NAME="${APP_NAME:-maltose-production}"

# Diagnose the toolchain before touching pm2 — if it can't be found, say where
# to look instead of failing with a bare "command not found".
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy:${ENV_NAME}] ERROR: pm2 not on PATH" >&2
  echo "[deploy:${ENV_NAME}]   node=$(command -v node 2>/dev/null || echo MISSING)" >&2
  echo "[deploy:${ENV_NAME}]   pnpm=$(command -v pnpm 2>/dev/null || echo MISSING)" >&2
  echo "[deploy:${ENV_NAME}]   pm2=$(command -v pm2 2>/dev/null || echo MISSING)" >&2
  echo "[deploy:${ENV_NAME}]   PATH=$PATH" >&2
  echo "[deploy:${ENV_NAME}]   hint: pm2 installed via 'pnpm add -g' lives in \$(pnpm bin -g);" >&2
  echo "[deploy:${ENV_NAME}]         or set DEPLOY_TOOLCHAIN_PATH to its bin dir." >&2
  exit 1
fi

echo "[deploy:${ENV_NAME}] (re)creating pm2 app ${APP_NAME} from ecosystem.config.cjs"
# delete + start is the ONLY pm2 path that reliably applies BOTH env changes
# AND structural attributes (script, instances, exec_mode, node_args) from the
# ecosystem file. `pm2 start ecosystem.config.cjs` against an already-running
# app internally degrades to restartProcessId, which merges only env vars —
# structural edits silently never apply, and `pm2 save` re-pins the stale
# definition into ~/.pm2/dump.pm2. delete clears the registered definition so
# the following start re-parses the freshly rsynced eco file in full
# (verified empirically 2026-09-08; see ADR-0034 operational note).
pm2 delete "${APP_NAME}" 2>/dev/null || true
pm2 start ecosystem.config.cjs --only "${APP_NAME}"
pm2 save >/dev/null 2>&1 || true

echo "[deploy:${ENV_NAME}] done"
