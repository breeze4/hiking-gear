#!/usr/bin/env bash
# The repository gate. Woodpecker runs this file from .woodpecker/check.yaml,
# and it is the same gate to run before a local commit.
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile
pnpm test
pnpm run build
