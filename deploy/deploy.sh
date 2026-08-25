#!/usr/bin/env bash
# Maltose server deploy script (ADR-0033).
# Invoked by deploy-gate.sh after CI rsyncs artifacts into the target dir.
# The target dir comes from GitHub secret (passed as $2 by the gate), so the
# server works in exactly the dir the artifacts were synced into.
# Usage: deploy.sh <production|staging> <target-dir>
set -euo pipefail

ENV_NAME="${1:?usage: deploy.sh <production|staging> <target-dir>}"
TARGET_DIR="${2:?usage: deploy.sh <production|staging> <target-dir>}"

if [ ! -d "${TARGET_DIR}" ]; then
  echo "[deploy:${ENV_NAME}] target dir missing: ${TARGET_DIR}" >&2
  exit 1
fi
cd "${TARGET_DIR}"

echo "[deploy:${ENV_NAME}] installing production deps"
if [ -f package.json ]; then
  pnpm install --prod --frozen-lockfile || pnpm install --prod
fi

# Pick the pm2 app name per environment (maltose-production / maltose-staging).
# ecosystem.config.cjs declares both apps; APP_NAME is set by the deploy gate.
APP_NAME="${APP_NAME:-maltose-production}"

echo "[deploy:${ENV_NAME}] reloading pm2 app ${APP_NAME}"
pm2 reload "${APP_NAME}" || pm2 start ecosystem.config.cjs --only "${APP_NAME}"
pm2 save >/dev/null 2>&1 || true

echo "[deploy:${ENV_NAME}] done"
