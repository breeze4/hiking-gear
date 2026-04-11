# Step 7 — /to-buy screen (handoff)

Plan: `docs/plans/2026-04-11-05-to-buy-screen.md`

## Endpoints added

### `GET /api/to-buy`

Response: `Array<{ item: Item, neededQty: number }>` where `Item` is the standard library shape (`id, name, description, weight, authorUnit, price, image, imageUrl, url, singleton, acquired, weighed`). Sorted by item name (case-insensitive). Returns `[]` when nothing is unacquired.

Rule:
- Singletons: included iff `items.acquired = 0` AND at least one `category_items` row with `qty > 0` in a non-archived list exists. `neededQty` is always `1`.
- Non-singletons: grouped by item id; `neededQty = SUM(category_items.qty)` across all rows where `category_items.acquired = 0`, `qty > 0`, and the parent list is not archived.

### `POST /api/to-buy/acquire`

Request body: `{ itemId: number }`.
Response body: `{ itemsAffected: number, categoryItemsAffected: number }`.
- 400 if itemId is missing / not a finite number.
- Returns `{ itemsAffected: 0, categoryItemsAffected: 0 }` when the item id is not found (no error).

Behavior:
- If `items.singleton = 1`: `UPDATE items SET acquired = 1 WHERE id = ?`. `categoryItemsAffected` is `0`.
- If `items.singleton = 0`: `UPDATE category_items SET acquired = 1 WHERE item_id = ? AND category_id IN (SELECT id FROM categories WHERE list_id IN (SELECT id FROM lists WHERE archived = 0))`. `itemsAffected` is `0`. Rows in archived lists are deliberately left alone so archiving a trip freezes its state.

## Aggregator module

`server/prep-aggregator.ts`:

```ts
export function buildToBuyList(database: Database.Database): ToBuyRow[];
export function acquireItem(database: Database.Database, itemId: number): AcquireResult;
export type ToBuyRow = { item: ToBuyItem; neededQty: number };
export type AcquireResult = { itemsAffected: number; categoryItemsAffected: number };
```

Both are pure functions over a db handle, usable by tests that open a temporary sqlite file via `better-sqlite3`.

## `runMigrations` extraction — YES

`server/db.ts` now exports `runMigrations(database)` containing every `CREATE TABLE`, `ALTER TABLE`, and the one-shot prep backfill block. The module-level init still opens the production db at `DB_PATH`, sets pragmas, and calls `runMigrations(db)` exactly once. `setSetting`/`getSetting` remain module-level bound to the production `db` handle (tests don't need them). `server/index.ts` still imports `{ db, getSetting }` unchanged.

This is the only schema-related refactor. No new schema columns.

## Test script

`package.json`:

```
"test": "node --test --import tsx/esm src/lib/prep.test.ts src/lib/progress.test.ts server/prep-aggregator.test.ts"
```

`npm test` now runs 29 tests total: 5 prep + 11 progress + 13 aggregator.

## Aggregator test count — 13

1. empty db → empty list
2. singleton acquired item is excluded
3. singleton unacquired item appears with neededQty=1
4. non-singleton unacquired across two trips: neededQty sums
5. non-singleton partially acquired: only unacquired rows contribute
6. items only in archived trips are excluded
7. excluded rows (qty=0) do not count
8. dedupes singleton appearing in multiple trips
9. results sorted by name case-insensitively
10. acquireItem singleton: flips items.acquired only
11. acquireItem non-singleton: flips category_items.acquired across non-archived only
12. acquireItem is idempotent (state-based assertion; see deviations)
13. acquireItem on missing id is a no-op

## Client additions

- `src/api.ts` — `api.fetchToBuy()` and `api.acquireFromToBuy(itemId)`.
- `src/ToBuyScreen.tsx` — new route component with empty state, optimistic remove-on-click, re-insert on error, `×N` quantity only when `> 1`, item name as external link when `url` is set.
- `src/App.tsx` — route `/to-buy` and top-nav link.
- `src/styles.css` — `.to-buy-list`, `.to-buy-row`, `.to-buy-main`, `.to-buy-name`, `.to-buy-qty`, `.to-buy-meta`, `.to-buy-actions`, `.to-buy-empty`.

The component uses the existing shadcn `Button` (`size="sm"`, default variant) imported from `./components/ui/button`.

## Deviations from the plan

1. **Idempotence test uses state assertions, not `changes===0`**. SQLite's `UPDATE ... WHERE id = ?` reports `changes = 1` even when the row's column value is already `1`, because `changes` counts rows matched by the UPDATE, not rows whose values actually changed. The plan's "calling acquire twice is idempotent" was read as "the end state is the same and the to-buy list is empty after both calls." The test now asserts `items.acquired = 1` and `buildToBuyList(db) === []` after the second call rather than asserting the second call's row count. Functionally identical for the user-visible contract.
2. **`acquireItem` on a missing id returns `{itemsAffected: 0, categoryItemsAffected: 0}` rather than throwing**. The server handler returns 200 with the zero counts. A separate test covers this. Simpler than a 404 and the to-buy screen never hits this path in practice (it only references item ids it just received from `GET /api/to-buy`).
3. **Item name rendered as an external anchor** (`item.url` → `<a href target=_blank>`) rather than a link to the item library. The plan allowed either; an anchor to the product page was more useful for a shopping workflow and required zero new routes.
4. **Styles are flat-list based (`<ul>`), not a table**. The row count is expected to stay small and the per-row layout needs to wrap on narrow viewports; a flat list handled that more cleanly than a table would have.

## Smoke test

Local: copied `~/dev/hiking-gear/data/hiking-gear.db` into the worktree, started the server against it, and confirmed:

- `GET /api/to-buy` → `[]` (backfilled db has nothing to buy).
- After `UPDATE items SET acquired=0 WHERE id=3`: endpoint returned `[{item: {id:3, name:"Patagonia hiking pants", singleton:true, acquired:false, ...}, neededQty:1}]`.
- `POST /api/to-buy/acquire {itemId:3}` → `{itemsAffected:1, categoryItemsAffected:0}`, `GET /api/to-buy` → `[]`.

Non-singleton and archived-trip paths are covered by the aggregator tests rather than a live manual check (the dev db only has singletons unacquired via surgical update).
