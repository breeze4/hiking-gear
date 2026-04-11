# Create-blank-list endpoint

## Parent spec

`docs/specs/2026-04-11-02-gear-planning-agent.md`

## What to build

A new `POST /api/lists` endpoint that creates a blank trip list with a name and optional description, then returns the new row. This unblocks the `/gear-plan` cold-start mode, which needs to write a trip shell up front before filling in categories. Today the only list-creation paths are `POST /api/lists/from-template` and `POST /api/lists/:id/clone`; neither fits a "blank list, I'll populate it myself" flow.

Scope is exactly the new handler plus its typecheck gate. No client changes, no UI. This is pure backend.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

From `docs/specs/2026-04-11-02-gear-planning-agent.md`:

- Cold-start workflow step 3 — "Skill writes the trip parameters into a freeform description and creates a new empty list via `POST /api/lists`."

## Acceptance criteria

- [ ] `npx tsc --noEmit` clean.
- [ ] `POST /api/lists` with body `{ "name": "Test trip", "description": "..." }` returns 200 with the new row shaped as `{ id, name, description, externalId, position }`.
- [ ] `POST /api/lists` with body `{ "name": "Test trip" }` (no description) returns a row with `description: ''` (or `null`, matching whatever existing lists look like).
- [ ] `POST /api/lists` with missing or non-string `name` returns 400 with a helpful error.
- [ ] `POST /api/lists` with an empty string `name` returns 400.
- [ ] The new row's `position` is set so it sorts at the end (or at the top — whichever matches how the app's existing list-switcher orders "newest"). Match existing semantics, don't invent new ones.
- [ ] The `externalId` on a blank list is `null`, distinguishing it from lighterpack-imported trips.
- [ ] Smoke test with curl from another terminal against `npm run dev`:
  - `curl -X POST http://localhost:3000/api/lists -H 'content-type: application/json' -d '{"name":"smoke test"}'`
  - `curl http://localhost:3000/api/lists` should include the new row.
- [ ] Open the app, verify the new blank trip appears in the list switcher and can be navigated to without error (it should show an empty trip view — no categories, zero totals).
- [ ] Build, typecheck, commit, deploy per the project-level working rule.

## Owns

- `server/index.ts` — **add one new handler**: `app.post('/api/lists', ...)`. Place it next to `app.put('/api/lists/:id', ...)` (around line 294) so list CRUD routes sit together. Do not touch any other handler.

## Must not touch

- `server/db.ts` — no schema changes. The `lists` table already supports blank rows.
- `server/import.ts`, `server/import-template.ts` — unrelated.
- `src/**` — no client changes in this slice. The skill will call the endpoint from Claude Code via curl; the web UI doesn't need a "new blank trip" button yet.
- `.claude/skills/**`, `docs/guidelines/**` — owned by later plans (`2026-04-11-07`, `2026-04-11-08`, `2026-04-11-09`).

## Defines interfaces

- **`POST /api/lists`** HTTP contract — consumed by plan `2026-04-11-09-gear-plan-skill.md`. Request body `{ name: string, description?: string }`. Response body: the new list row in the same shape `GET /api/lists/:id` returns (`{ id, name, description, externalId, position }`). This shape must be stable — the gear-plan skill will parse it.

## Pattern exemplar

- **MUST follow the pattern in**: `server/index.ts` `app.put('/api/lists/:id', ...)` (around line 294) — same file structure, same `readJson` helper, same `badRequest` / row-fetch-on-response pattern. The new POST handler mirrors this shape: validate body → insert → re-select the row → return it.
- **Follow the pattern in**: `server/index.ts` `app.post('/api/categories', ...)` (around line 314) — for the "POST that creates a new row, computes position, returns the inserted row" pattern. Use its `position` computation approach as a reference for how lists assign position (grep for `INSERT INTO lists` elsewhere in the file to find the existing position semantics; match them).

## Tasks

- [ ] Read `server/index.ts` around the existing list handlers to understand the `lists` row shape, how `position` is assigned on insert elsewhere (search for existing `INSERT INTO lists` sites in `server/import.ts` and the `from-template` + `clone` handlers), and the `readJson` / `badRequest` / `notFound` helpers.
- [ ] Add `app.post('/api/lists', ...)` next to `app.put('/api/lists/:id', ...)`. Validate `name` is a non-empty string. Coerce `description` to a string (default empty). Insert a new row with `external_id = NULL` and a position that matches existing semantics.
- [ ] Re-select the inserted row using the same columns as `GET /api/lists/:id` (or `PUT /api/lists/:id`'s response) and return it.
- [ ] `npx tsc --noEmit` and fix any issues.
- [ ] Run `npm run dev` and smoke-test with curl (see acceptance criteria). Navigate to the new trip in the browser and verify it loads cleanly.
- [ ] Commit. Deploy via `./deploy/deploy.sh`.
- [ ] Update `docs/plans/INDEX.md` — move this plan from Not Started to Completed.

## Implementation notes

- **Position**: find out what existing code does. Two plausible patterns: (a) `max(position) + 1` to push new lists to the end of the ordered list, or (b) `0` so the newest list is at the top. The trip view lands on the highest-id list by default (per the main spec), so id-ordering already makes "newest first" work regardless of position. Match whatever `from-template` and `clone` do for position so behavior is consistent.
- **`external_id`**: always `NULL` for blank lists. The lighterpack import uses `external_id` to track re-import identity; blank lists have no upstream source.
- **`description` default**: mirror whatever `from-template` writes for lists without a description — likely an empty string. Don't introduce `null` if the existing column is `''`.
- **No archived flag**: leave `archived` at its schema default (presumably 0/false).
- **Error shape**: use the existing `badRequest(c, 'message')` helper for validation errors. Don't invent a new error shape.
- **Zero tests**: project norm is typecheck-only. The handler is ~15 lines; typecheck + curl smoke + browser load is sufficient.
