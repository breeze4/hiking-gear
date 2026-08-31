Dev: `pnpm run dev` (server at :3000, Vite client at :5173 — client proxies `/api` to the server)
Typecheck: `pnpm exec tsc --noEmit`
Test: `pnpm test` (node --test suites in `src/lib/` and `server/`)
Build: `pnpm run build` (vite build)
Gate: `bash scripts/ci-gates.sh` (install, test, build — the same file Woodpecker runs)
Deploy: push `main`. Woodpecker runs `.woodpecker/check.yaml`, `publish.yaml`,
and `deploy.yaml`, then the BeeBaby deployment command replaces the container.
Verify: `curl http://beebaby:8002/api/health` returns 200. Its `version` value
reads `dev`, so read the deployed commit from
`/srv/beebaby/deployments/hiking-gear/active.env` on BeeBaby instead.
See `docs/deployment.md` for the build, rollback, and data path.
Access: `http://beebaby:8002/`

Stack: Hono + better-sqlite3 on the server (`server/`), React + Vite on the client (`src/`). SQLite file at `data/hiking-gear.db`. Schema migrations live inline in `server/db.ts` as idempotent PRAGMA-check + ALTER blocks — append new ones; don't rewrite existing ones.

Run the build and tests before each commit. After you push `main`, make sure that the Woodpecker pipeline passes.

## Plans

All implementation plans live in `docs/plans/` with an index at `docs/plans/INDEX.md`.

When you complete a plan or change its status, update `docs/plans/INDEX.md`:
- Move the plan between the Completed / In Progress / Not Started sections
- Keep the table format consistent
- Do this in the same commit as the plan file changes

## Making changes

The deployed BeeBaby database is the source of truth for gear data. Use the
database when the user asks you to change a gear list or item.
