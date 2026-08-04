Dev: `pnpm run dev` (server at :3000, Vite client at :5173 — client proxies `/api` to the server)
Typecheck: `pnpm exec tsc --noEmit`
Test: `pnpm test` (node --test suites in `src/lib/` and `server/`)
Build: `pnpm run build` (vite build)
Deploy: commits to `main` auto-deploy to beebaby via cicd-router (post-commit hook enqueues; router gates the exact SHA, rsyncs, bootstraps, restarts `hiking-gear.service`). If a commit produced no router run (sandboxed commits can skip the hook), enqueue manually: `/Users/breeze/dev/cicd-router/scripts/cicd-router-enqueue.sh --config /Users/breeze/dev/hiking-gear/cicd-router.project.yml --state-root /Users/breeze/dev/cicd-router/.local/cicd-router --runner-label com.breeze.cicd-router.runner`. Verify with `curl http://beebaby:8002/api/health` — `version` must show the new SHA.
Access: `http://beebaby:8002/`

Stack: Hono + better-sqlite3 on the server (`server/`), React + Vite on the client (`src/`). SQLite file at `data/hiking-gear.db`. Schema migrations live inline in `server/db.ts` as idempotent PRAGMA-check + ALTER blocks — append new ones; don't rewrite existing ones.

Build, test, and commit after each change — the commit itself deploys; confirm the router run went green.

## Plans

All implementation plans live in `docs/plans/` with an index at `docs/plans/INDEX.md`.

When you complete a plan or change its status, update `docs/plans/INDEX.md`:
- Move the plan between the Completed / In Progress / Not Started sections
- Keep the table format consistent
- Do this in the same commit as the plan file changes

## Making changes

Beebaby's deployed version is what my source of truth is for gear. Use that whenever I ask you to fix a gear list or an item or anything like that.