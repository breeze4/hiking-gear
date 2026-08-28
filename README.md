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

Run these commands before you commit:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm run build
```

## Deployment

A local commit to `main` creates a durable Factory deployment intent. The
Factory runner publishes the exact commit to GitHub and asks Factory to record
the deployment. The `factory.project.yml` file is the active contract. Factory
runs `scripts/cicd-router-gates.sh` as the project gate. Factory runs
`deploy/remote-bootstrap.sh`, restarts `hiking-gear.service`, and examines
`/api/health` on port `8002`.

The `cicd-router.project.yml` file is audit and recovery data only. The source
copy excludes `data/`, so deployment does not replace the live database.

The live app is available at `http://beebaby:8002/` on the private tailnet.

## Gear guidance

For category rules and planning guidance, see
[`docs/guidelines/README.md`](docs/guidelines/README.md).
