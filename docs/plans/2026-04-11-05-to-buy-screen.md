# To-buy screen — cross-trip aggregated shopping list

## Parent spec

`docs/specs/2026-04-11-01-prep-for-trip.md`

## What to build

A new `/to-buy` route that shows every unacquired library item across all non-archived trips, deduped by item, with a single "Mark acquired" action per row that bulk-flips the authoritative `acquired` field. For singleton items, one click flips `items.acquired=1`. For non-singleton items, one click flips every matching `category_items.acquired=1` across non-archived trips. Archived trips and excluded rows (`qty=0`) are excluded from the aggregation.

Scope:

- **Server aggregator** (`ToBuyAggregator`) — a new server-side function that returns the deduped list. Pulls from `items` joined through `category_items` and `categories` and `lists`, filters to non-archived lists, filters to effectively-unacquired rows (via the resolver: singleton → `items.acquired=0`; non-singleton → any `category_items.acquired=0` row with `qty>0`), dedupes by item id, and sums `neededQty` for non-singletons (sum of `qty` across matching `category_items` rows).
- **`GET /api/to-buy`** — new endpoint wrapping the aggregator. Response: `Array<{ item: {...libraryFields, singleton}, neededQty: number }>`.
- **`POST /api/to-buy/acquire`** — new endpoint. Body `{ itemId }`. For singleton items (read `items.singleton`), UPDATE `items.acquired=1` where id matches. For non-singleton items, UPDATE `category_items.acquired=1` where `item_id = ?` AND the parent list is not archived.
- **Bulk-acquire server module** (`ToBuyAcquireAction`) — the implementation of the POST handler, structured as a testable function. Returns the list of affected row counts for debugging / testing.
- **`/to-buy` route** — new route in `src/App.tsx`, linked from the top nav alongside Templates and Items. Component lives at `src/ToBuyScreen.tsx`.
- **Rendering** — flat list, one row per item. Each row shows: item name (link to item library if exists), per-item weight + author unit, price, `neededQty` (displayed as "×N" when >1, hidden when 1), optional image/url, and a "Mark acquired" shadcn Button. Clicking optimistically removes the row from the list and fires `POST /api/to-buy/acquire`; on error, reinserts the row.
- **Empty state** — when the list is empty, show "Nothing to buy — you're all set." No decoration needed.
- **No trip references** — the screen does not show which trips need an item. The user explicitly doesn't want that.
- **Sorting** — default sort by item name (case-insensitive). No sort controls in v1.

## Type

AFK

## Blocked by

- Blocked by `2026-04-11-01-prep-status-foundation.md` — needs schema and resolver.
- Soft-sequenced after `2026-04-11-02-prep-defaults-at-entry-points.md` — without the defaults backfill, every lighterpack-imported item will appear as "unacquired" on first deploy, which is noisy but not broken. The two plans can technically be implemented in either order as long as they both ship before an end user tries the `/to-buy` screen.

## User stories addressed

- 10 — dedicated `/to-buy` screen, cross-trip aggregation
- 11 — deduped by item
- 12 — mark acquired from screen, ripple to all trips
- 21 — reassuring empty state
- 22 — non-singleton bulk-acquire in one click

## Acceptance criteria

- [ ] `npm test` passes with new `ToBuyAggregator` and `ToBuyAcquireAction` tests.
- [ ] Aggregator test cases: (a) empty db; (b) one singleton item acquired; (c) one singleton item unacquired; (d) one non-singleton item unacquired across 2 trips (neededQty sums); (e) one non-singleton item partially acquired (only unacquired trips contribute to neededQty); (f) items only in archived trips are excluded; (g) excluded rows (`qty=0`) are not counted; (h) deduped correctly when the same item appears in multiple trips.
- [ ] Acquire test cases: (a) singleton flip — only `items.acquired=1` is written; (b) non-singleton flip — only `category_items.acquired=1` is written across non-archived trips; (c) non-singleton flip does not touch rows in archived trips; (d) calling acquire twice is idempotent.
- [ ] `GET /api/to-buy` returns the aggregator result as JSON.
- [ ] `POST /api/to-buy/acquire` with body `{ itemId }` performs the bulk flip and returns 200 with a count summary.
- [ ] `/to-buy` route is registered in `src/App.tsx` and a link appears in the top nav.
- [ ] The `/to-buy` screen renders each row with name, weight, price, `×N` qty (when >1), and a "Mark acquired" button.
- [ ] Clicking "Mark acquired" optimistically removes the row; on API failure the row reappears and an error is surfaced (match existing error-recovery pattern in TripView).
- [ ] Empty state renders "Nothing to buy — you're all set."
- [ ] After marking an item acquired on this screen, navigating to a trip view shows that item with its Acq cell checked (for singletons) or with the corresponding `category_items.acquired=1` (for non-singletons).
- [ ] Typecheck, build, deploy clean.

## Owns

- `server/index.ts` — the `GET /api/to-buy` and `POST /api/to-buy/acquire` endpoints. Reuse the existing handler file; do not split into a new file.
- `server/prep-aggregator.ts` — **new file** — the `ToBuyAggregator` and `ToBuyAcquireAction` functions as pure server-side modules, taking a db handle as an argument so they can be tested against a temporary sqlite. Alternatively, if co-locating with `server/index.ts` is simpler, the pure functions can be extracted into a named export from within `server/index.ts` — but a separate file is cleaner for testability.
- `server/prep-aggregator.test.ts` — **new file** — integration tests using a temporary sqlite file. Seed via the existing schema migrations; assert aggregator and acquire behavior.
- `src/ToBuyScreen.tsx` — **new file** — the new route component.
- `src/App.tsx` — register the `/to-buy` route and add a top-nav link.
- `src/api.ts` — add `fetchToBuy()` and `acquireFromToBuy(itemId)` helpers.
- `src/styles.css` — styles for the to-buy list rows.

## Must not touch

- `src/lib/prep.ts` — consume only.
- `src/lib/progress.ts` — consume only (or don't consume — not strictly needed here).
- `src/TripView.tsx` — no trip-view changes in this slice. The `/to-buy` screen does not link back into specific rows.
- `server/import.ts`, `server/import-template.ts`, clone-trip handler — owned by plan #2.

## Defines interfaces

- **`GET /api/to-buy`** response shape — flat array of `{ item: LibraryItem, neededQty: number }`. This is a new external API consumed by `src/ToBuyScreen.tsx`. Stable contract.
- **`POST /api/to-buy/acquire`** request/response shape — request `{ itemId: number }`, response `{ itemsAffected: number, categoryItemsAffected: number }` (or similar).

## Pattern exemplar

- **Follow the pattern in**: `server/index.ts` `GET /api/items/all` handler (around line 517) — a similar "select joined rows, shape them, return JSON" shape. Use it as the template for the aggregator's SQL style.
- **Follow the pattern in**: `server/index.ts` — any existing endpoint that performs bulk updates inside a `db.transaction(...)`. The clone-trip handler or the `/api/lists/from-template` handler are the closest siblings for the acquire endpoint.
- **MUST follow the pattern in**: `src/lib/prep.test.ts` and `src/lib/progress.test.ts` — same `node:test` harness invocation. For sqlite-backed tests, open a temporary db via `better-sqlite3` with a temp file path (no in-memory — the db.ts schema init is written for a file path).
- **Follow the pattern in**: `src/ItemLibrary.tsx` — closest sibling for a full-page list view with per-row actions. Mimic its top-level layout, section header, and error handling.
- **Follow the pattern in**: `src/App.tsx` — the existing route registration pattern for Templates and Items. Mirror it for `/to-buy`.

## Tasks

- [ ] Create `server/prep-aggregator.ts` with two functions: `buildToBuyList(db) → Array<{ item, neededQty }>` and `acquireItem(db, itemId) → { itemsAffected, categoryItemsAffected }`. Both take the db handle explicitly so tests can pass a temporary-file db.
- [ ] Write the aggregator SQL. Easier path: two queries — one for singletons (`WHERE items.singleton=1 AND items.acquired=0 AND EXISTS(select from category_items/lists where list not archived and qty>0 and item_id = items.id)`) and one for non-singletons (`SELECT item, SUM(qty) from category_items where item.singleton=0 AND ci.acquired=0 AND list not archived AND qty>0 GROUP BY item_id`). Union the two lists, sort by name.
- [ ] Write the acquire SQL: read `items.singleton` for the itemId, then either `UPDATE items SET acquired=1 WHERE id=?` or `UPDATE category_items SET acquired=1 WHERE item_id=? AND category_id IN (SELECT id FROM categories WHERE list_id IN (SELECT id FROM lists WHERE archived=0))`.
- [ ] Create `server/prep-aggregator.test.ts`. Use `better-sqlite3` to open a temp db, run the schema init from `server/db.ts` (may need to refactor `db.ts` slightly to export a `runMigrations(db)` function — if so, note in the plan and scope it), seed rows, call the functions, assert.
- [ ] Wire `GET /api/to-buy` and `POST /api/to-buy/acquire` endpoints in `server/index.ts`, delegating to the aggregator module.
- [ ] Add `fetchToBuy` and `acquireFromToBuy` to `src/api.ts`.
- [ ] Create `src/ToBuyScreen.tsx` with the list rendering, optimistic acquire, error recovery, and empty state.
- [ ] Register the route in `src/App.tsx` and add a top-nav link.
- [ ] Add styles for the to-buy row layout.
- [ ] Manual smoke test against the deployed build: verify a seeded unacquired singleton appears, click "Mark acquired", verify it disappears and the trip view reflects the change. Same for a non-singleton across two trips. Archive one of those trips and verify that archived-trip contribution is no longer counted.
- [ ] Typecheck, build, deploy.

## Implementation notes

- **Schema-init refactor hint** — the existing `server/db.ts` opens a specific file at module load. The aggregator tests need a separate db handle. The cleanest path is to factor out a `runMigrations(db)` function that takes a db instance, call it once from the module-level init against the production file, and call it again from tests against a temp file. This is a small scope creep on this plan; alternatively the tests can run against the production db with a transaction-rollback harness, which is uglier. **Go with the refactor**: it's a 10-line change and pays off for every future sqlite-backed test.
- **Non-singleton acquire SQL** — when flipping `category_items.acquired=1`, restrict to rows where `category_id IN (SELECT id FROM categories WHERE list_id IN (SELECT id FROM lists WHERE archived=0))`. Double-check the `archived` column name matches what's in the existing schema (see `lists.archived` in the 2026-04-10-02 migration block).
- **Idempotence** — calling acquire on an already-acquired item is a no-op (the UPDATE touches zero rows). Tests should verify this explicitly.
- **Optimistic UI** — when the user clicks "Mark acquired" on the screen, remove the row from local state immediately. On API error, re-insert the row at its previous position with a subtle error indicator. Match the error-recovery pattern from `src/TripView.tsx`.
- **Empty state styling** — a centered paragraph with muted-foreground text. Don't add illustrations or decorative elements.
- **No trip references in rows** — resist the temptation to show "needed in: Sierra trip, JMT, shakedown." The spec explicitly excluded this.
- **Wishlist is not in scope** — do not add a "save for later" or "dismiss" action. The only action per row is "Mark acquired."
