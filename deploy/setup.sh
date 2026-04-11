#!/usr/bin/env bash
# One-time setup on beebaby. Run from the dev machine:
#   ssh beebaby 'bash -s' < deploy/setup.sh
set -euo pipefail

APP_DIR=~/dev/hiking-gear

echo "==> Creating app + data directories"
mkdir -p "$APP_DIR/data"

echo "==> Enabling lingering (so user services start on boot)"
loginctl enable-linger "$(whoami)" 2>/dev/null || echo "Warning: could not enable linger."

echo "==> Setup complete."
echo "    Place your existing data/hiking-gear.db at $APP_DIR/data/hiking-gear.db before first deploy if you have one."
echo "    Then run deploy.sh from your dev machine."
