Dev: `pnpm run dev` (server at :3000, Vite client at :5173 — client proxies `/api` to the server)
Typecheck: `pnpm exec tsc --noEmit`
Test: `pnpm test` (node --test suites in `src/lib/` and `server/`)
Build: `pnpm run build` (vite build)
Deploy: push `main` to send the exact commit to Factory.
The `factory.project.yml` file is the active contract.
Factory runs the retained `scripts/cicd-router-gates.sh` gate and restarts
`hiking-gear.service`. It then examines `/api/health`.
The `cicd-router.project.yml` file is audit data only.
Examine `http://beebaby:8002/api/health`. Its `version` value must match the
deployed SHA.
Access: `http://beebaby:8002/`

Stack: Hono + better-sqlite3 on the server (`server/`), React + Vite on the client (`src/`). SQLite file at `data/hiking-gear.db`. Schema migrations live inline in `server/db.ts` as idempotent PRAGMA-check + ALTER blocks — append new ones; don't rewrite existing ones.

Run the build and tests before each commit. After you push `main`, make sure that the Factory deployment passes.

## Plans

All implementation plans live in `docs/plans/` with an index at `docs/plans/INDEX.md`.

When you complete a plan or change its status, update `docs/plans/INDEX.md`:
- Move the plan between the Completed / In Progress / Not Started sections
- Keep the table format consistent
- Do this in the same commit as the plan file changes

## Making changes

The deployed BeeBaby database is the source of truth for gear data. Use the
database when the user asks you to change a gear list or item.
