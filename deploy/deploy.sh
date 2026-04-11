#!/usr/bin/env bash
# Deploy hiking-gear to beebaby from dev machine.
# Usage: ./deploy/deploy.sh
set -euo pipefail

HOST=beebaby
APP_DIR=dev/hiking-gear
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Syncing code to $HOST:~/$APP_DIR"
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='data' \
  --exclude='screenshots' \
  --exclude='.env' \
  --exclude='reference/template/.cache' \
  "$PROJECT_DIR/" "$HOST:$APP_DIR/"

echo "==> Installing deps and building"
ssh "$HOST" "cd ~/$APP_DIR && npm install && npm run build"

echo "==> Installing user systemd service"
ssh "$HOST" "mkdir -p ~/.config/systemd/user && cp ~/$APP_DIR/deploy/hiking-gear.service ~/.config/systemd/user/ && systemctl --user daemon-reload"

echo "==> Restarting service"
ssh "$HOST" "systemctl --user restart hiking-gear"

echo "==> Done. Status:"
ssh "$HOST" "systemctl --user status hiking-gear --no-pager -l" || true
