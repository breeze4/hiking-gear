Dev: `npm run dev` (server at :3000, Vite client at :5173 — client proxies `/api` to the server)
Typecheck: `npx tsc --noEmit` (primary quality gate — no test framework)
Build: `npm run build` (vite build)
Deploy: `./deploy/deploy.sh` (rsyncs to beebaby, installs, builds, restarts user systemd service). OK to deploy after a clean build and finishing a piece of work.
Access: `http://beebaby:8002/`

Stack: Hono + better-sqlite3 on the server (`server/`), React + Vite on the client (`src/`). SQLite file at `data/hiking-gear.db`. Schema migrations live inline in `server/db.ts` as idempotent PRAGMA-check + ALTER blocks — append new ones; don't rewrite existing ones.

## Plans

All implementation plans live in `docs/plans/` with an index at `docs/plans/INDEX.md`.

When you complete a plan or change its status, update `docs/plans/INDEX.md`:
- Move the plan between the Completed / In Progress / Not Started sections
- Keep the table format consistent
- Do this in the same commit as the plan file changes
