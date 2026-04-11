# Singleton flag end-to-end

## Parent spec

`docs/specs/2026-04-10-02-gear-quantity-controls.md`

## What to build

Plumb a new `singleton` boolean on `items` (shared library) through every layer: migration, DB shape, API read/write, TypeScript types, and the item library editor. At the end of this slice:

- The column exists on the `items` table with default `1`, backfilled for all existing rows.
- `POST /api/items` and `PUT /api/items/:id` accept `singleton` in the request body and persist it.
- All item-reading endpoints (`GET /api/items`, `GET /api/items/all`, `GET /api/items/:id/usage`, and the joined-read used by category_items responses) return `singleton` as a boolean.
- The `Item` and `CategoryItem` TypeScript types include `singleton: boolean`.
- The `ItemEditor` in `src/ItemLibrary.tsx` exposes a checkbox labelled "Usually qty=1 (singleton)" and round-trips the value.

No change to `TripView.tsx` behavior. No new component. No visible change anywhere except inside the existing item-library editor.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

The spec is a lightweight spec with no numbered user stories. This slice maps to:

- **Spec § Solution, bullet 1** — the data portion: adding a `singleton` flag on items to mark "usually 1" vs "usually multi".
- **Spec § Behavior — Defaults & existing data** — migration backfills existing items with `singleton=1`; new items default to `singleton=1`.

## Acceptance criteria

- [ ] `items` table has a `singleton INTEGER NOT NULL DEFAULT 1` column, added via the existing PRAGMA-check pattern in `server/db.ts`.
- [ ] All existing rows have `singleton=1` after migration runs (natural consequence of the `DEFAULT 1`, confirm with a SELECT).
- [ ] `POST /api/items` accepts `{ singleton: boolean }` in the body and persists it. Missing field defaults to `1`.
- [ ] `PUT /api/items/:id` accepts partial `{ singleton }` updates and persists them.
- [ ] `GET /api/items`, `GET /api/items/all`, `GET /api/items/:id/usage`, and the joined `category_items` responses all include `singleton` as a boolean (not 0/1).
- [ ] `src/types.ts`: `Item` type gains `singleton: boolean`. `CategoryItem` type gains `singleton: boolean`.
- [ ] `ItemEditor` component in `src/ItemLibrary.tsx` renders a checkbox for `singleton`, defaulted from `initial.singleton ?? true`, and submits it via `onSubmit`.
- [ ] `/items` page: toggling the checkbox, clicking Save, and reloading the page shows the new value persisted.
- [ ] `tsc --noEmit` passes clean.
- [ ] `npm run dev` boots with no console errors.

## Owns

- `server/db.ts` — append a new migration block after the existing `archived` block (same PRAGMA pattern):
  ```
  {
    const cols = db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'singleton')) {
      db.exec('ALTER TABLE items ADD COLUMN singleton INTEGER NOT NULL DEFAULT 1');
    }
  }
  ```
- `server/index.ts` — specific additions only:
  - `ITEM_FIELDS` map (~line 348): add `singleton: 'singleton'`.
  - `rowItem()` helper (~line 359): add `singleton` to the SELECT, cast to boolean.
  - `POST /api/items` handler (~line 363): parse `singleton` from body with default `true`, add to INSERT column list and VALUES.
  - `PUT /api/items/:id` handler (~line 377): in the `ITEM_FIELDS` loop, singleton will automatically flow through, but the value coercion branch needs a `boolean` case — coerce `body.singleton` to `1`/`0`.
  - `GET /api/items` handler (~line 405): add `singleton` to both SELECT queries (query and empty-query branches), expose as `singleton` column aliased to boolean in the result shape.
  - `joinedCategoryItem()` helper (~line 415): add `i.singleton` to the SELECT.
  - `shapeCategoryItem()` helper (~line 439): add `singleton: !!row.singleton`.
  - `GET /api/items/all` handler (~line 506): add `i.singleton` to SELECT.
  - `GET /api/items/:id/usage` handler (~line 521): verify whether it selects item fields — if so, add singleton. If it only selects usage, leave alone.
  - Any other handler that constructs an Item shape (search for `rowItem(` and the column list `'SELECT id, name, description, weight, author_unit'`) — add the column.
- `src/types.ts` — `Item` type: add `singleton: boolean`. `CategoryItem` type: add `singleton: boolean`. `ItemWithUsage` is `Item & { usedIn: number }` so it picks up automatically.
- `src/ItemLibrary.tsx` — `ItemEditor` component (~line 240):
  - Add `const [singleton, setSingleton] = useState(initial.singleton ?? true);`
  - Add a checkbox field to the form.
  - Include `singleton` in the `onSubmit` payload.
- `src/api.ts` — if the `itemsAll`, `createItem`, or `patchItem` methods have hardcoded field lists in the request shape type, extend them. (They probably pass objects through untyped — verify.)

## Must not touch

- `src/TripView.tsx` — owned by plan `2026-04-10-07-row-edit-modal.md` and `2026-04-10-08-row-controls-leave-off.md`. Do NOT add the singleton checkbox anywhere in TripView or its ItemRow — that belongs to the next slice.
- `src/AddItemModal.tsx` — the "create new item inline" form inside it does not need a singleton checkbox; new items default to `singleton=1` via the POST body default, which matches the spec.
- Any `category_items` endpoint behavior — `singleton` lives on `items`, not `category_items`.
- `server/import.ts` and `server/import-template.ts` — the `DEFAULT 1` on the column handles imported rows without touching import code. Do NOT modify importers.

## Defines interfaces

- **`Item.singleton: boolean`** in `src/types.ts` — consumed by plans `2026-04-10-07` (RowEditModal renders it) and `2026-04-10-08` (row controls read it to choose layout).
- **`CategoryItem.singleton: boolean`** in `src/types.ts` — consumed by plan `2026-04-10-08`.
- **`POST/PUT /api/items` body shape** — now accepts `singleton`. Consumed by plan `2026-04-10-07`'s split-write logic.

## Pattern exemplar

- **MUST follow the pattern in**: `server/db.ts` lines 85–97 — the existing `priority` and `archived` migration blocks. Use the identical PRAGMA-check-then-ALTER shape. Same block goes after the existing two.
- **Follow the pattern in**: `server/index.ts` `ITEM_FIELDS` map and the `PUT /api/items/:id` handler (~line 377) — shows how to add a field that flows through the PUT loop automatically. The only quirk is that `singleton` is a boolean, so the coercion branch needs `args.push(v ? 1 : 0)` rather than the string cast.
- **Follow the pattern in**: `src/ItemLibrary.tsx` `ItemEditor` component (~line 240) — matches the existing field render style (label wrapping an input), form state via `useState`, submission via the `submit()` function.

## Tasks

- [ ] Add migration block to `server/db.ts` after the `archived` block. Boot the server once to run it; verify with `PRAGMA table_info(items)` that the column exists and existing rows have `singleton=1`.
- [ ] Add `singleton: 'singleton'` to `ITEM_FIELDS` in `server/index.ts`.
- [ ] In the `PUT /api/items/:id` ITEM_FIELDS loop, add a boolean coercion branch: if `key === 'singleton'`, push `body.singleton ? 1 : 0`.
- [ ] Update `rowItem()` to SELECT `singleton` and expose it. Cast to boolean in the return (or do it at the caller — pick one consistent spot).
- [ ] Update `POST /api/items` to parse `singleton` from body with default `true`, add to INSERT.
- [ ] Update `GET /api/items` (both branches), `GET /api/items/all`, `joinedCategoryItem`, `shapeCategoryItem`, and any other item-shaping code to include `singleton` as boolean.
- [ ] Add `singleton: boolean` to `Item` and `CategoryItem` in `src/types.ts`.
- [ ] Add singleton checkbox to `ItemEditor` in `src/ItemLibrary.tsx`. Default from `initial.singleton ?? true`. Submit via the `onSubmit` payload.
- [ ] Run `tsc --noEmit` — fix any type errors that fall out.
- [ ] Run `npm run dev` and smoke-test `/items`: open an item, toggle singleton off, save, reload, confirm the checkbox reflects the saved state.
- [ ] Verify a fresh `POST /api/items` without `singleton` in the body returns an item with `singleton=true` (default behavior).

## Implementation notes

**Boolean cast convention in this codebase**: existing booleans (`worn`, `consumable`) are stored as `INTEGER` in SQLite and cast with `!!row.worn` when shaped into the API response. Follow the same pattern: `singleton: !!row.singleton` in every shaping function. On the write side, coerce with `body.singleton ? 1 : 0`.

**Grep checklist for column additions**: before marking complete, grep for these SELECT fragments to make sure all reading paths include the new column:

- `'SELECT id, name, description, weight, author_unit'` in `server/index.ts` — used by `rowItem`, `GET /api/items`, `GET /api/items/all`.
- `joinedCategoryItem` in `server/index.ts` — used by the category_items PUT/POST responses.
- `server/import.ts` and `server/import-template.ts` — search for `SELECT * FROM items` or similar. These likely already use `SELECT *`, which handles the new column automatically. Only modify if they select explicit columns.

**Checkbox placement in ItemEditor**: put it in a new row after the URL fields (not in the weight/unit/price row, which is tightly packed). Simple unstyled checkbox is fine — the existing editor has no checkbox prior art but inline checkboxes are straightforward.
