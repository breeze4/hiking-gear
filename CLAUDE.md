Dev: `pnpm run dev` (server at :3000, Vite client at :5173 — client proxies `/api` to the server)
Typecheck: `pnpm exec tsc --noEmit`
Test: `pnpm test` (node --test suites in `src/lib/` and `server/`)
Build: `pnpm run build` (vite build)
Gate: `bash scripts/ci-gates.sh` (workflow lint, install, test, build — the same file Woodpecker runs)
Deploy: push `main`. Woodpecker runs `.woodpecker/check.yaml`, `build-image.yaml`,
`publish.yaml`, and `deploy.yaml`, then the BeeBaby deployment command replaces the container.
The workflows come from the beebaby-infra CI template (`scripts/stamp-ci.py`); put project checks in `gate_project` of `scripts/ci-gates.sh`.
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

<!-- cos:managed-project:start -->
## Reading copy

This section applies only when the file `.cos/reading-copy` exists in this checkout. If that file doesn't exist, ignore this section.

When `.cos/reading-copy` exists:

- This checkout is a reading copy of the project `hiking-gear`, which the chief of staff owns on beebaby.
- The git hooks in this checkout reject every commit and push.
- To change the project, ask the chief of staff. Or run `cos eject hiking-gear` here, make the change, and run `cos migrate hiking-gear` when you finish.
<!-- cos:managed-project:end -->
