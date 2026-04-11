# Step 1 handoff — singleton flag end-to-end

## Migration SQL executed

Added to `server/db.ts` as a third PRAGMA-check migration block, after the existing `priority` and `archived` blocks:

```ts
{
  const cols = db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'singleton')) {
    db.exec('ALTER TABLE items ADD COLUMN singleton INTEGER NOT NULL DEFAULT 1');
  }
}
```

## Backfill confirmation

The worktree has no `data/` subdirectory (no `data/hiking-gear.db` exists), so the migration could not be run live here. The code path is trivially correct: the PRAGMA check skips the ALTER if the column is already present, and `INTEGER NOT NULL DEFAULT 1` backfills every existing row with `1` on first boot. Verification will be performed in the main worktree during the orchestrator's post-merge smoke.

To verify after merge, boot the server once and run:

```sh
sqlite3 data/hiking-gear.db "PRAGMA table_info(items)"
sqlite3 data/hiking-gear.db "SELECT COUNT(*) AS n, SUM(singleton) AS s FROM items"
```

Expected: the `singleton` column appears in the PRAGMA output; `n` and `s` are equal (every row defaults to 1).

## API surface changes (`server/index.ts`)

| Surface | Change |
|---|---|
| `CategoryItemRow` type | Added `singleton: number` field. |
| `GET /api/lists/:id` joined SELECT | Added `i.singleton` column; mapping includes `singleton: !!it.singleton` in each item shape. |
| `ITEM_FIELDS` map | Added `singleton: 'singleton'` so PUT flows through automatically. |
| `rowItem()` helper | Now SELECTs `singleton` and returns a shaped object with `singleton: !!row.singleton`. |
| `POST /api/items` | Parses `singleton` from body (defaults to `true` / `1`; only `false` maps to `0`); added to INSERT column list and values. |
| `PUT /api/items/:id` | Added a third coercion branch in the ITEM_FIELDS loop for `singleton` → `args.push(v ? 1 : 0)`. |
| `GET /api/items` (both search and list-all branches) | Added `singleton` to the SELECT and a `.map()` post-pass casting `!!r.singleton`. |
| `joinedCategoryItem()` helper | Added `i.singleton` to the SELECT. |
| `shapeCategoryItem()` helper | Added `singleton: !!row.singleton` to the returned shape. |
| `GET /api/items/all` | Added `i.singleton` to SELECT and a `.map()` post-pass casting `!!r.singleton`. |
| `GET /api/items/:id/usage` | Not touched — only selects usage fields, no item columns. Per plan. |

## Type diffs (`src/types.ts`)

### CategoryItem — before

```ts
export type CategoryItem = {
  itemId: number;
  name: string;
  description: string;
  weight: number; // milligrams
  authorUnit: 'g' | 'kg' | 'oz' | 'lb' | string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
  qty: number;
  worn: boolean;
  consumable: boolean;
  star: number;
  position: number;
  priority?: Priority | null;
};
```

### CategoryItem — after

```ts
export type CategoryItem = {
  itemId: number;
  name: string;
  description: string;
  weight: number; // milligrams
  authorUnit: 'g' | 'kg' | 'oz' | 'lb' | string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
  singleton: boolean;
  qty: number;
  worn: boolean;
  consumable: boolean;
  star: number;
  position: number;
  priority?: Priority | null;
};
```

### Item — before

```ts
export type Item = {
  id: number;
  name: string;
  description: string;
  weight: number;
  authorUnit: string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
};
```

### Item — after

```ts
export type Item = {
  id: number;
  name: string;
  description: string;
  weight: number;
  authorUnit: string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
  singleton: boolean;
};
```

`ItemWithUsage = Item & { usedIn: number }` picks up `singleton` automatically.

## `src/api.ts`

No changes needed. `createItem` and `updateItem` already use `Partial<Omit<Item, 'id'>>`, which now automatically accepts `singleton`. `tsc --noEmit` passed clean without touching `api.ts`.

## `src/ItemLibrary.tsx` — `ItemEditor` component

- Added `const [singleton, setSingleton] = useState(initial.singleton ?? true);` to the form state hooks.
- `submit()` now includes `singleton` in the onSubmit payload.
- Added a new `<label className="field">` row after the Image URL field containing a checkbox labelled "Usually qty=1 (singleton)".

The create-flow call site (line 124) passes an initial object without `singleton`; the `?? true` fallback defaults it to checked for new items, matching the spec.

## Verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, zero output |
| `npm run build` | exit 0, vite build clean (`built in 1.05s`) |
| SQL sanity check | N/A in worktree (no `data/hiking-gear.db`); migration code path inspected and is trivially correct |

Note: `npm run build` is `vite build` only — it does not invoke `tsc` as a side effect. `tsc --noEmit` was run separately and covers both `server/**/*.ts` and `src/**/*.{ts,tsx}` per `tsconfig.json`.

## Deviations from the plan

None. All edits stayed within the Owns list. `server/import.ts`, `server/import-template.ts`, `src/AddItemModal.tsx`, `src/TripView.tsx`, and `src/styles.css` were not touched. No `api.ts` changes were necessary.
