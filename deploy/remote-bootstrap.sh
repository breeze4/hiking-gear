#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci
npm run build

mkdir -p ~/.config/systemd/user
cp deploy/hiking-gear.service ~/.config/systemd/user/
systemctl --user daemon-reload
