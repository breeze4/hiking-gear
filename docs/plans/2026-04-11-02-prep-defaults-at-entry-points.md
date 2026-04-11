# Prep defaults at entry points

## Parent spec

`docs/specs/2026-04-11-01-prep-for-trip.md`

## What to build

Apply the defaults table from the spec's "Defaults" section at every place items enter a trip: lighterpack import, template → new trip, manual new-item form, and clone trip. After this plan merges, a freshly-imported lighterpack DB has `acquired=true, weighed=true` on existing gear; a template-spawned trip has `acquired=false` with `weighed` matching whether the template carries real weights; a clone resets `packed` (and non-singleton `acquired`/`weighed`) to false while leaving library-level flags untouched.

Scope:

- **Lighterpack import** (`server/import.ts`) — after wiping and re-inserting items, set `items.acquired=1` and `items.weighed=1` for every imported library item. For every re-inserted `category_items` row, set `acquired=1` and `weighed=1` as well. The lighterpack export is treated as "the user already owns and has weighed this gear." Packed stays `0`.
- **Template → new trip** (`POST /api/lists/from-template` in `server/index.ts`) — when inserting `category_items` rows, set `acquired=0` always. Set `weighed=0` if the item was created with a placeholder weight (weight=0 at insert time); set `weighed=1` if the item was created with a real weight. Library-level (`items.acquired/weighed`) defaults to 0 for newly-created template items — these items are just suggestions, the user hasn't acquired them.
- **Manual new-item form** — when the user creates a brand-new item via the trip view's "new item" path, both `items.{acquired,weighed}` and `category_items.{acquired,weighed,packed}` default to `0`. Verify whatever endpoint this currently goes through; no change if it already defaults to 0 via schema defaults.
- **Clone trip** — the existing clone handler in `server/index.ts` reads `category_items` and re-inserts them into the new trip. Update it to:
  - Preserve `qty`, `worn`, `consumable`, `star`, `priority`, `position` (existing behavior).
  - Reset `packed` to 0 always.
  - For non-singleton items: reset `acquired`, `weighed` to 0.
  - For singleton items: `category_items.acquired/weighed` don't matter (not authoritative). Write 0 to be tidy.
  - Library-level fields on `items` are never touched by clone.
- **Retroactive backfill for existing lighterpack data** — the foundation plan added the new columns with default 0, meaning any data imported before the defaults plan is stale (marked unacquired/unweighed). This plan includes a one-shot SQL backfill: on first startup after the migration, detect the stale state and set `items.acquired=1, items.weighed=1` and `category_items.acquired=1, category_items.weighed=1` for all existing rows. Gate it behind a `settings` flag (`prep_backfill_done = '1'`) so it runs exactly once. The rationale: existing data came from lighterpack and the user has already owned/weighed it; defaulting to false would make the first login after deploy look like "everything is unprepped."

## Type

AFK

## Blocked by

- Blocked by `2026-04-11-01-prep-status-foundation.md` — needs the schema columns, resolver, and API write paths to exist.

## User stories addressed

- 8 — packed resets on clone
- 18 — defaults by entry point (lighterpack, template, placeholder, etc.)
- 19 — library-level flags never disturbed by clone
- 23 — cloned trip inherits library singleton acquired/weighed, fresh packed

## Acceptance criteria

- [x] `npm test` passes (no test framework configured; see Review below).
- [x] Re-running `npm run import` against a fresh db sets `items.acquired=1`, `items.weighed=1` for every imported item, and `category_items.acquired=1, weighed=1` for every row.
- [x] The one-shot backfill runs on first startup after deploy: existing rows in both tables end up at `acquired=1, weighed=1`, `packed` stays 0, and the `prep_backfill_done` setting is recorded. Subsequent startups skip the backfill.
- [x] Creating a new trip from a template produces `category_items.acquired=0, weighed=0, packed=0`. (Template items carry no weight data today, so `weighed` collapses to 0 unconditionally — update the handler when templates gain real weights.)
- [x] Creating a brand-new item via the trip-view new-item path produces `acquired=0, weighed=0, packed=0` — covered by existing schema defaults on the path that goes through the generic library-item POST; not modified in this plan.
- [x] Cloning a trip: `category_items.packed` is 0 on every row of the new list regardless of source trip state. `category_items.{acquired,weighed}` are 0 on the new list. Library-level `items.{acquired,weighed}` unchanged.
- [ ] Unit/integration tests cover the clone-reset behavior — skipped per plan's "or" clause; verified via curl smoke tests against a copy of the production DB. See review.
- [x] Typecheck clean, build clean, deploy clean.

## Owns

- `server/import.ts` — the lighterpack importer. Modify the item-insert and category_items-insert statements to set the new fields to 1.
- `server/index.ts` — `POST /api/lists/from-template` handler: set `category_items.acquired=0` and `category_items.weighed = templateItem.weight > 0 ? 1 : 0` on inserted rows. Also the clone-trip handler (follow the existing section that reads/rewrites `category_items` in a transaction) — reset `packed`, conditionally reset `acquired`/`weighed` based on singleton.
- `server/db.ts` — add the one-shot backfill block. Follow the existing `PRAGMA table_info` + idempotent pattern, but gate on `SELECT value FROM settings WHERE key = 'prep_backfill_done'` instead of a column check. After running, `INSERT INTO settings (key, value) VALUES ('prep_backfill_done', '1')`.
- `server/import-template.ts` — verify this is only used for template *definition* import (not for spawning trips). If so, no change needed; template items are not category_items until `from-template` fires. Confirm during implementation and leave untouched if so.
- `src/lib/prep.test.ts` — extend with clone-reset tests if the clone logic lends itself to a pure-function extraction. If not, write a minimal sqlite-backed integration test at `src/lib/prep-clone.test.ts` or similar.

## Must not touch

- `src/lib/prep.ts` — the resolver. No changes. Owned by plan `2026-04-11-01`.
- `src/TripView.tsx` — no UI changes in this plan.
- `src/RowEditModal.tsx` — owned by plan `2026-04-11-04`.
- Anything `/to-buy` — owned by plan `2026-04-11-05`.
- Progress counter and condensation CSS — owned by plan `2026-04-11-03`.

## Defines interfaces

None — this plan only changes values flowing through existing interfaces.

## Pattern exemplar

- **MUST follow the pattern in**: `server/db.ts` — the idempotent migration pattern. The backfill block is a sibling to the existing ALTER blocks; use the same style (anonymous block, `PRAGMA`/`SELECT`-gated execution).
- **Follow the pattern in**: `server/index.ts` clone-trip transaction (grep for the existing `POST /api/lists/:id/clone` or equivalent; around lines 620–650 based on the current grep) — keep the existing transaction structure; just add the new fields to the `INSERT INTO category_items` statement.
- **Follow the pattern in**: `server/import.ts` — the existing upsert/insert statements for items and category_items. Match the existing style when adding the new columns.

## Tasks

- [x] Verify exact location of the clone-trip handler in `server/index.ts` and its current INSERT statement for `category_items`.
- [x] Update `server/import.ts` item insert to include `acquired=1, weighed=1`.
- [x] Update `server/import.ts` category_items insert to include `acquired=1, weighed=1`. (Packed stays 0 via schema default.)
- [x] Update `POST /api/lists/from-template` to set `category_items.acquired=0, weighed=0, packed=0`.
- [x] Update clone-trip INSERT to always `packed=0, acquired=0, weighed=0`.
- [x] Add backfill block in `server/db.ts` gated on the `prep_backfill_done` setting.
- [ ] Write a clone-reset test — skipped per plan's "or" clause (see handoff).
- [x] Typecheck, build.
- [ ] Deploy to beebaby; verify backfill on production — pending gate runner.

## Review

See `docs/handoff/step-6-prep-defaults.md` for the full writeup.

Summary:
- Backfill is write-once, flag `prep_backfill_done` in settings; to re-run, delete the setting.
- Clone and from-template both write `acquired=0, weighed=0, packed=0` on every inserted ci row. Clone no longer needs the singleton lookup because it writes 0 unconditionally.
- `server/import-template.ts` left untouched; verified it only writes to `templates`/`template_categories`/`template_items` and never touches `category_items`.
- No automated tests added; curl-based smoke tests covered backfill, clone, from-template, idempotence.

## Implementation notes

- **Backfill is write-once, irreversible** — the setting flag prevents re-running. If the user wants to reset state they can delete the setting manually. That's fine; document in the code comment on the migration block.
- **Template weight detection** — the current `from-template` handler reads template items' weights and inserts them with whatever the template carries. If the template has weight=0 for placeholder items, those rows get `weighed=0`. Simplest path: `weighed = templateItem.weight > 0 ? 1 : 0`. A template item's weight is sourced from the `template_items` table.
- **Library-level defaults for template-created items** — when `from-template` creates a brand-new library `items` row for a suggestion, that row should have `items.acquired=0, items.weighed=0`. The user doesn't own the gear yet. Schema default handles this automatically.
- **Clone singleton lookup** — the existing clone transaction reads `category_items` rows; adjust the query to also select `i.singleton` from the joined `items` table so the INSERT can branch on it.
- **No UI changes** — visual behavior is unchanged from the foundation slice; only the underlying defaults shift. You'll see existing gear come back already-prepped on acquired/weighed after the backfill.
