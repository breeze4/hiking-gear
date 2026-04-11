# Step 1 — Prep status foundation (handoff)

## 1. Resolver signature

From `src/lib/prep.ts`:

```ts
export type ItemPrep = {
  singleton: boolean;
  acquired: boolean;
  weighed: boolean;
};

export type CiPrep = {
  acquired: boolean;
  weighed: boolean;
  packed: boolean;
};

export type PrepEffective = {
  acquired: boolean;
  weighed: boolean;
  packed: boolean;
};

export type PrepWriteTarget = {
  acquired: 'item' | 'categoryItem';
  weighed: 'item' | 'categoryItem';
  packed: 'categoryItem';
};

export type PrepStatus = {
  effective: PrepEffective;
  writeTarget: PrepWriteTarget;
};

export function resolvePrepStatus(item: ItemPrep, ci: CiPrep): PrepStatus;
```

Singleton items: `effective.acquired`/`effective.weighed` sourced from `item.*`, `writeTarget` is `'item'`.
Non-singleton: all three sourced from `ci.*`, `writeTarget` is `'categoryItem'` for everything.
`packed` is always sourced from `ci.packed` regardless of singleton.

## 2. New `CategoryItem` fields

From `src/types.ts`:

```ts
// Raw authoritative prep values, per the resolver rule:
itemAcquired: boolean;   // items.acquired
itemWeighed: boolean;    // items.weighed
ciAcquired: boolean;     // category_items.acquired
ciWeighed: boolean;      // category_items.weighed
packed: boolean;         // category_items.packed
effective: PrepEffective;        // { acquired, weighed, packed } — resolved server-side
writeTarget: PrepWriteTarget;    // { acquired, weighed, packed } with 'item'|'categoryItem'
```

The UI reads `effective.*` for display and `writeTarget[field]` to decide which PATCH endpoint to call. Raw fields are kept on the payload so downstream plans can re-run the resolver or aggregate per-side counts.

Also added to `src/types.ts`:
- `Item` extended with `acquired: boolean; weighed: boolean`
- New exported types: `PrepEffective`, `PrepWriteTarget`

## 3. Schema columns added

All as `INTEGER NOT NULL DEFAULT 0`, via idempotent PRAGMA-checked `ALTER TABLE` blocks in `server/db.ts`:

1. `items.acquired`
2. `items.weighed`
3. `category_items.acquired`
4. `category_items.weighed`
5. `category_items.packed`

Pre-existing rows come back with all five fields as `0`/`false`. No backfill in this step — step 2 (`2026-04-11-02-prep-defaults-at-entry-points.md`) owns retroactive defaults for lighterpack imports.

## 4. Test script

Verbatim line in `package.json`:

```
"test": "node --test --import tsx/esm src/lib/prep.test.ts"
```

Verified working: `npm test` → 5 tests pass.

## 5. Resolver sharing (server vs client)

The server imports the resolver directly from the client module: `import { resolvePrepStatus } from '../src/lib/prep.js';` in `server/index.ts`. The `.js` extension is required by the `module: ESNext` / `moduleResolution: Bundler` tsconfig; tsx resolves it to the actual `.ts` source at runtime. `src/lib/prep.ts` has zero non-type imports, so this cross-boundary import is safe.

Rationale: keeps exactly one authoritative copy of the singleton rule. Downstream plans (`-03`, `-04`, `-05`) that need the same resolution will import from the same place.

## 6. New client API helper name

`api.patchItem(id, patch)` — added in `src/api.ts`. It is a thin alias over `api.updateItem` (both PUT `/api/items/:id`), so the plan-declared name exists while keeping the existing `updateItem` for the row-edit modal. Consumers of prep cells call `patchItem`; consumers of the row-edit modal continue calling `updateItem`.

Also widened:
- `api.updateCategoryItem` body type now accepts `acquired?: boolean; weighed?: boolean; packed?: boolean` in addition to the existing `qty/worn/consumable/star`.

## 7. Deviations from the plan

- **`CategoryItem` field naming** — the plan said "raw `acquired`/`weighed`/`packed` fields" at the top of `CategoryItem`. I kept `packed` at the top level but stored the item-side raw values as `itemAcquired`/`itemWeighed` and the ci-side raw values as `ciAcquired`/`ciWeighed`. The `effective` object is the source of truth for UI display. This avoids a naming collision (a single `acquired` field that means one of two different columns depending on singleton) and makes the payload self-describing. Downstream plans should prefer `effective.*` for display and only touch the raw side fields if they're doing progress/aggregation that needs to know *where* the flag came from.

- **`writeTarget` shipped from server** — the plan left it implicit whether the server or client computes `writeTarget`. I compute it server-side and ship it on the payload so the client doesn't need to import the resolver just to dispatch a click. The resolver is still used on the client for unit-test coverage and remains the single source of truth for the rule (server calls it to populate `writeTarget`).

- **`patchItem` is an alias for `updateItem`** — both resolve to `PUT /api/items/:id`. I kept `updateItem` (used by the row-edit modal) and added `patchItem` as the plan-named helper for the prep cells, since they have slightly different semantics in intent (partial field patch vs full item edit).

- **`POST /api/items`, `GET /api/items`, `GET /api/items/all` minor edits** — the plan scoped me to three handlers, but because I extended the `Item` type to include `acquired`/`weighed`, these endpoints had to return the new fields to satisfy the type contract. All I did was add the two columns to their SELECT + mapping — no other behavioral changes.

- **Did NOT add a weighed checkbox to the row-edit modal** — step 5 owns that.
- **Did NOT add a progress counter or condensation** — steps 3/4 own that.
- **Did NOT backfill existing data** — step 2 owns that.
- **Did NOT touch clone-trip or lighterpack-import handlers** — step 2 owns the column-preservation update.
