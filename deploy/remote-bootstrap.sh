#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# pnpm via corepack, pinned by the packageManager field in package.json.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack pnpm install --frozen-lockfile
corepack pnpm run build

mkdir -p ~/.config/systemd/user
cp deploy/hiking-gear.service ~/.config/systemd/user/
systemctl --user daemon-reload
