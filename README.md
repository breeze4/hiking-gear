# Hiking Gear

Hiking Gear is a private trip pack planner. The server uses Hono and
better-sqlite3. The client uses React and Vite.

The live BeeBaby database is the source of truth for gear lists and items. The
local `data/hiking-gear.db` file is development data.

## Run the app

Install dependencies and start the server and client:

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

The server listens on port `3000`. The Vite server listens on port `5173` and
proxies `/api` to the server.

## Run the gates

Run the repository gate before you commit. It installs the locked dependencies,
runs the tests, and builds the client:

```bash
bash scripts/ci-gates.sh
```

Run the typecheck as well, because the gate does not include it:

```bash
pnpm exec tsc --noEmit
```

## Deployment

Woodpecker on BeeBaby tests each commit on the `main` branch, builds an
immutable container image, publishes it to GitHub Container Registry, and
deploys that digest through the restricted deployment command. Caddy routes
tailnet port `8002` to the running container. For the complete path, read
[Deploy Hiking Gear](docs/deployment.md).

The container mounts the retained data directory, so a deployment never replaces
the live database.

The `deploy/` directory records the retired source-copy deployment. It stays
until the container deployment passes one BeeBaby reboot and seven days of
normal operation, because the documented rollback path still needs it.

The live app is available at `http://beebaby:8002/` on the private tailnet.

## Gear guidance

For category rules and planning guidance, see
[`docs/guidelines/README.md`](docs/guidelines/README.md).
