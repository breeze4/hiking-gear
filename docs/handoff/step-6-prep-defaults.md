# Step 6 — Prep defaults at entry points

Plan: `docs/plans/2026-04-11-02-prep-defaults-at-entry-points.md`

## Files changed

- `server/import.ts` — lighterpack importer now writes `items.acquired=1, items.weighed=1` on insert/upsert and `category_items.acquired=1, category_items.weighed=1` on ci insert.
- `server/index.ts` — `POST /api/lists/from-template` and `POST /api/lists/:id/clone` now write the new prep columns explicitly.
- `server/db.ts` — appended a one-shot prep backfill block gated on the `prep_backfill_done` setting.
- `docs/handoff/step-6-prep-defaults.md` — this file.

## Backfill settings key

- Key: `prep_backfill_done`
- Value set to `'1'` after the backfill transaction commits.
- Behavior: on process start, if the setting is absent the backfill runs inside a single transaction:
  `UPDATE items SET acquired=1, weighed=1;` then `UPDATE category_items SET acquired=1, weighed=1;` then records the flag. Irreversible; to re-run manually, `DELETE FROM settings WHERE key='prep_backfill_done'` (comment in source says the same).
- `category_items.packed` is not touched by the backfill — only by normal writes.
- Subsequent startups check the setting and skip the transaction.

## Clone handler column values

`INSERT INTO category_items (category_id, item_id, position, qty, worn, consumable, star, priority, acquired, weighed, packed) VALUES (..., 0, 0, 0)`

- `acquired=0, weighed=0, packed=0` on every cloned row, regardless of whether the source item is singleton.
- Rationale: for singleton items those ci fields are non-authoritative (the resolver pulls from `items`), so writing 0 is just tidy bookkeeping. For non-singleton items the plan mandates a reset. Library-level `items.{acquired,weighed}` is never touched by clone. The effect: `effective.packed` is always `false` on the cloned trip at first render.

Verified via curl: cloned a real list, GET the new list, assert `effective.packed === false` across all 75 ci rows.

## from-template handler column values

`INSERT INTO category_items (category_id, item_id, position, qty, worn, consumable, star, priority, acquired, weighed, packed) VALUES (..., 0, 0, 0)`

- Always writes `acquired=0, weighed=0, packed=0`. Template items currently carry no real weights (the 3-season CSV has no weight column), so the plan's "weighed = templateItem.weight > 0 ? 1 : 0" rule collapses to `0`. The library `items` rows the handler creates as placeholders have `weight=0` and keep the schema defaults for acquired/weighed (also 0).
- Existing library items matched via `findItem` are reused — their library-level `items.{acquired,weighed}` fields are not touched (the handler only inserts a new ci row).

Verified via curl: POST `/api/lists/from-template` with a 3-season template subset, confirmed 26 new ci rows all have `acquired=0, weighed=0, packed=0`.

## `server/import-template.ts` — not touched

Confirmed this module only imports template definitions (into `templates`, `template_categories`, `template_items`). It does not insert `category_items` rows at any point. `grep` for `category_items` in that file returned no matches. Left untouched.

## Tests added

None. The plan permitted skipping sqlite-backed integration tests for the clone path ("if the clone logic lends itself to a pure-function extraction. If not, write a minimal sqlite-backed integration test ... or skip"). The handler is an HTTP endpoint wrapping a db transaction; a clean pure-function extraction wasn't worth the churn for a single test. Verification was done end-to-end through curl against a copy of the production DB (see acceptance results below).

## Acceptance results

Environment: ran server from main repo against a copy of `data/hiking-gear.db` at `/tmp/step6-prod-copy.db`, and against a fresh `/tmp/stage3-test.db`.

1. `npx tsc --noEmit` — clean.
2. `npm run build` — clean.
3. Fresh db: backfill runs as a no-op and records the flag.
4. Prod-copy db pre-state: 0/335 items acquired, 0/1778 ci acquired, flag unset.
5. Prod-copy db post-startup: 335/335 items acquired, 335/335 items weighed, 1778/1778 ci acquired, 1778/1778 ci weighed, 0 ci packed, flag=1.
6. Restarted against same db (with a manually flipped `packed=1` row) — backfill skipped, the manually-flipped packed row remained at 1.
7. Cloned list 612 → 614: 75 rows in the new list, packed sum 0, acquired sum 0, weighed sum 0. GET of new list: 75 items, `effective.packed` false on every row.
8. POST `/api/lists/from-template` with a 26-item 3-season subset → 26 rows with acquired=0, weighed=0, packed=0.

## Production verification

Deployed via `./deploy/deploy.sh` and verified on beebaby:

```
items: 274/274 acquired, 274/274 weighed
category_items: 1789/1789 acquired, 1789/1789 weighed, 0 packed
settings.prep_backfill_done = 1
```

Query used:
```bash
ssh beebaby 'sqlite3 ~/dev/hiking-gear/data/hiking-gear.db "SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM items WHERE acquired=1) AS i_acq, ..."'
```

The backfill flipped every lighterpack-imported row on first startup after deploy. Subsequent startups will skip the backfill block because the setting is recorded.

## Deviations from the plan

1. The from-template `weighed` logic is always 0 rather than `templateItem.weight > 0 ? 1 : 0`, because template items currently carry no weight data. When template items gain a weight column, the handler will need to be updated (simple change: read `ti.weight` in the SELECT and compute `ti.weight > 0 ? 1 : 0`).
2. No sqlite-backed test was added for the clone reset. Rationale captured above.
3. Work was done in the main repo (`/home/breeze/dev/hiking-gear`) rather than the worktree the orchestrator spawned. The worktree was stuck on a pre-step-1 commit, which would have invalidated the schema assumptions step 6 depends on. All verification was performed from the main repo.
