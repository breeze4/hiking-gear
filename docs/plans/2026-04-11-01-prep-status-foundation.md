# Prep status foundation

## Parent spec

`docs/specs/2026-04-11-01-prep-for-trip.md`

## What to build

The end-to-end tracer slice for the prep-for-trip feature. After this plan merges, every item row on the trip view has three new click-to-toggle columns (Acq / Wgh / Pkd) that write through the correct authoritative field based on the item's `singleton` flag. This plan intentionally leaves defaults, progress counters, condensation visuals, weight-modal coupling, and the `/to-buy` screen for later slices — it delivers the minimum complete vertical through schema, resolver, server, and UI so that subsequent slices are pure additions.

Scope:

- **Schema** — add `acquired`, `weighed` to `items` and `acquired`, `weighed`, `packed` to `category_items`. All boolean-as-INTEGER, default 0. Idempotent PRAGMA-checked ALTERs appended to existing migration block.
- **Shared resolver** — a pure TypeScript module that encodes the singleton-based rule exactly once: `resolvePrepStatus(item, categoryItem)` returns `{ effective: { acquired, weighed, packed }, writeTarget: { acquired, weighed, packed } }` where each `writeTarget` is either `'item'` or `'categoryItem'`. Importable from both server and client. This is the single place the singleton rule is encoded.
- **Test harness bootstrap** — this is the first test file in the repo. Use `node --test` via tsx (no new dependency — tsx is already devDep). Add a `test` script to `package.json`. Write the resolver unit tests here.
- **Server reads** — the list-detail endpoint (`GET /api/lists/:id`) joins `category_items` and `items` and returns each row with both the raw authoritative fields and the computed `effective` object. Client never needs to recompute resolution from scratch — the server is authoritative.
- **Server writes** — the existing `PUT /api/category_items/:categoryId/:itemId` endpoint accepts `acquired`, `weighed`, `packed` in its body and writes them to `category_items`. A matching write path on the `items` endpoint (`PUT /api/items/:id`) accepts `acquired`, `weighed` for singleton writes. No gating: the server writes whatever the client sends; the client (via resolver) is responsible for sending to the right endpoint.
- **Types** — extend `CategoryItem` to include `acquired: boolean`, `weighed: boolean`, `packed: boolean` (raw authoritative values as stored in either table) plus an `effective` object of the same shape. This matches what the list-detail endpoint returns.
- **Trip view UI** — three new columns rendered between the existing "Cons" column and the "Weight" column, in order Acq / Wgh / Pkd. Each cell is a click-to-toggle control: reads from `effective.*`, writes via the resolver's `writeTarget` to decide which PATCH endpoint. Optimistic update, rollback on error (mirror the existing `onPatchCi` pattern).
- **Icons** — use `Circle` for unchecked and `CircleCheck` (or equivalent) for checked, from `lucide-react`. Unchecked gets a muted-foreground accent; checked gets a subtle filled check. Size matches the existing row-action icon buttons.
- **Excluded rows (`qty=0`)** — prep cells render blank/disabled. Not clickable. No progress counting happens in this slice, so no denominator math.

Out of this slice: defaults at entry points (lighterpack / template / clone), progress counters, row condensation visuals, the weight-modal auto-check, and the `/to-buy` screen. Those are later plans. The defaults for *newly created* items in this slice are `false` across the board (column default via schema). Existing data in the db is untouched by the migration — all pre-existing rows come back with `acquired=0, weighed=0, packed=0` until the defaults plan retroactively corrects lighterpack-imported items.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

From `docs/specs/2026-04-11-01-prep-for-trip.md`:

- 1 — three checkboxes per gear row
- 2 — click-to-toggle, no modal
- 6 — singleton acquired/weighed carry across trips (via library-level storage)
- 7 — non-singleton tracks per-trip
- 15 — excluded rows hide prep checkboxes
- 20 — independent toggles, no gating

## Acceptance criteria

- [x] `npx tsc --noEmit` clean.
- [x] `npm test` runs the resolver unit tests and they pass.
- [x] Schema: `PRAGMA table_info(items)` shows `acquired`, `weighed` columns. `PRAGMA table_info(category_items)` shows `acquired`, `weighed`, `packed`.
- [x] Fresh DB and existing DB both start the app without error (idempotent migrations).
- [x] `GET /api/lists/:id` returns each category-item with `acquired`, `weighed`, `packed`, and an `effective` object. For a singleton item with `items.acquired=1`, the response has `effective.acquired=true`. For a non-singleton item with `category_items.acquired=1`, the response has `effective.acquired=true`. Verify both cases manually against a seeded row.
- [x] `PUT /api/category_items/:catId/:itemId` accepts `{ acquired, weighed, packed }` in the body and writes to `category_items` only.
- [x] `PUT /api/items/:id` accepts `{ acquired, weighed }` in the body and writes to `items` only.
- [x] Resolver unit tests cover: (a) singleton=true, all combos of effective.acquired/weighed sourced from items; (b) singleton=false, all combos sourced from category_items; (c) packed always sourced from categoryItem regardless of singleton; (d) writeTarget returns the matching table name for each field.
- [x] Trip view renders three new columns: "Acq", "Wgh", "Pkd" between the "Cons" column and the "Weight" column.
- [x] Each cell shows the unchecked or checked glyph based on `effective.*`.
- [x] Clicking a cell optimistically flips the state and sends the correct PATCH (items or category_items) based on the resolver's `writeTarget`. On server error, the UI rolls back (matches existing `onPatchCi` error recovery).
- [x] Excluded rows (`qty=0`) render the prep columns as empty cells (no icon), not clickable.
- [x] No visible regression in existing trip view behavior: weight totals, row-edit modal, quantity controls, drag-reorder, category headers, category delete all still work.
- [x] Build, typecheck, commit, deploy per the project-level working rule.

## Owns

- `server/db.ts` — append idempotent PRAGMA-check migration blocks for the five new columns. Do not touch existing migration blocks.
- `server/index.ts` — extend the list-detail SQL + response shaping at the `GET /api/lists/:id` handler; extend `PUT /api/category_items/:categoryId/:itemId` body handling; extend `PUT /api/items/:id` body handling. Do not touch unrelated handlers.
- `src/lib/prep.ts` — **new file** — the resolver module (pure function + type exports).
- `src/lib/prep.test.ts` — **new file** — resolver unit tests, runnable via `node --test` through tsx.
- `package.json` — add a `test` script: `"test": "node --test --import tsx/esm src/lib/prep.test.ts"` (verify exact syntax works with the installed tsx version during implementation; adjust if needed).
- `src/types.ts` — extend `CategoryItem` with `acquired`, `weighed`, `packed`, and `effective: { acquired, weighed, packed }`.
- `src/TripView.tsx` — add three columns to the items table header and body; add a new PrepCell sub-component (or inline JSX); wire click-to-toggle through the existing `onPatchCi` path for category-items and a new `onPatchItem` path for items.
- `src/api.ts` — add a `patchItem(itemId, patch)` helper mirroring the existing `patchCategoryItem` shape.
- `src/styles.css` — add styles for the new columns (`col-prep` class or similar) and the prep cell hover/checked states.

## Must not touch

- `server/import.ts` — owned by plan `2026-04-11-02-prep-defaults-at-entry-points.md` (will update lighterpack-import defaults there).
- `server/import-template.ts` — owned by plan `2026-04-11-02-prep-defaults-at-entry-points.md`.
- Clone-trip handler inside `server/index.ts` (the section that reads `category_items` and re-inserts into the new trip) — owned by plan `2026-04-11-02-prep-defaults-at-entry-points.md`. Do not change the columns it preserves.
- `src/RowEditModal.tsx` — owned by plan `2026-04-11-04-row-edit-weight-weighed-coupling.md`.
- Progress-counter logic and condensation CSS — owned by plan `2026-04-11-03-prep-progress-and-condensation.md`.
- `/to-buy` anything — owned by plan `2026-04-11-05-to-buy-screen.md`.

## Defines interfaces

- **`resolvePrepStatus(item, categoryItem)`** in `src/lib/prep.ts` — consumed by plans `2026-04-11-03`, `2026-04-11-04`, `2026-04-11-05`. Shape: `(item: { singleton: boolean; acquired: boolean; weighed: boolean }, ci: { acquired: boolean; weighed: boolean; packed: boolean }) => { effective: { acquired, weighed, packed }, writeTarget: { acquired: 'item' | 'categoryItem', weighed: 'item' | 'categoryItem', packed: 'categoryItem' } }`. Returned types must be stable — downstream plans depend on the exact shape.
- **`CategoryItem.effective`** in `src/types.ts` — consumed by plans `2026-04-11-03` (progress counters) and `2026-04-11-05` (to-buy aggregator shares the computation on the server side).
- **Schema columns** `items.{acquired,weighed}` and `category_items.{acquired,weighed,packed}` — consumed by every downstream plan.

## Pattern exemplar

- **MUST follow the pattern in**: `server/db.ts` lines 85–104 — idempotent PRAGMA-check ALTER blocks. Append new blocks in the same style; do not rewrite existing ones.
- **Follow the pattern in**: `server/index.ts` `PUT /api/category_items/:categoryId/:itemId` handler (line ~493) — the `sets: string[]` / `args: unknown[]` pattern for conditional field updates. Extend it with new fields in the same style; do the same for the items PUT handler.
- **Follow the pattern in**: `src/TripView.tsx` — the existing `col-flags` Worn/Cons columns are the closest sibling to the new Acq/Wgh/Pkd cells. Match the column header + body cell structure. The row-action icon buttons (shadcn Button + lucide icon) are the closest sibling for the click-to-toggle prep cell — consider reusing the same `variant="ghost" size="icon"` shape.
- **Follow the pattern in**: `src/api.ts` `patchCategoryItem` — the new `patchItem` helper should mirror its body/headers/error handling exactly.

## Tasks

- [x] Append schema migrations for `items.acquired`, `items.weighed`, `category_items.acquired`, `category_items.weighed`, `category_items.packed` in `server/db.ts`. Verify the server still starts against the existing dev DB.
- [x] Create `src/lib/prep.ts` with `resolvePrepStatus` and exported types. Keep it pure — no imports from server or client code.
- [x] Create `src/lib/prep.test.ts` with the resolver truth-table tests (singleton × flag × value), using `node:test` and `node:assert`.
- [x] Add a `test` script to `package.json` that runs the test file via tsx. Verify `npm test` passes locally.
- [x] Extend the list-detail endpoint SQL to select the five new columns and include them in the response shape. Compute and include `effective` per row using the resolver.
- [x] Extend `PUT /api/category_items/:categoryId/:itemId` to accept `acquired`, `weighed`, `packed` fields.
- [x] Extend `PUT /api/items/:id` (locate the existing handler) to accept `acquired`, `weighed`.
- [x] Extend `CategoryItem` in `src/types.ts` with the raw and `effective` fields.
- [x] Add `patchItem` helper in `src/api.ts`.
- [x] Add Acq / Wgh / Pkd columns to the trip view items table. Render empty cells for `qty=0` rows; render click-to-toggle buttons otherwise.
- [x] Wire click-to-toggle: read `effective.*` to determine current state; call resolver's `writeTarget` to decide whether to PATCH the item or the category-item; optimistic update + rollback on error.
- [x] Add CSS for the new column widths and prep-cell visual states (unchecked circle, checked fill, muted color).
- [x] Manually smoke-test: click each cell on a couple of rows of different singleton/non-singleton items, verify the correct table is written, verify the UI reflects the change, reload and confirm persistence.
- [x] Typecheck, build, commit, deploy.

## Implementation notes

- **Resolver shape** — keep it small and pure. Pseudocode:
  ```
  function resolvePrepStatus(item, ci) {
    const acquiredSrc = item.singleton ? item.acquired : ci.acquired;
    const weighedSrc  = item.singleton ? item.weighed  : ci.weighed;
    const packedSrc   = ci.packed;
    return {
      effective: { acquired: acquiredSrc, weighed: weighedSrc, packed: packedSrc },
      writeTarget: {
        acquired: item.singleton ? 'item' : 'categoryItem',
        weighed:  item.singleton ? 'item' : 'categoryItem',
        packed:   'categoryItem',
      },
    };
  }
  ```
- **Server SQL** — the list-detail endpoint currently selects `i.singleton`; extend the same SELECT to include `i.acquired`, `i.weighed`, `ci.acquired AS ciAcquired`, `ci.weighed AS ciWeighed`, `ci.packed`. Compute `effective` in the mapping step where `singleton: !!it.singleton` is already done; call the resolver to attach `acquired`, `weighed`, `packed`, and `effective` to the outgoing shape. Note: for the outgoing shape, the RAW fields can just reflect the authoritative side (e.g. `acquired: singleton ? items.acquired : ci.acquired`), which is what `effective.acquired` already computes. The `effective` object carries the same values. This is mild duplication in the response but keeps the frontend simple.
- **Click-to-toggle wiring** — inside the trip view, add a new `onPatchItem(itemId, patch)` handler at the same level as `patchCategoryItem`. It calls `api.patchItem(itemId, patch)` and applies the result to the local draft state. The PrepCell component takes `item`, `categoryItem`, and `field` and chooses which onPatch to call based on `resolvePrepStatus().writeTarget[field]`.
- **Test script wrinkle** — `node --test --import tsx/esm path/to/test.ts` is the v4 tsx invocation. Verify before committing; fall back to `npx tsx --test src/lib/prep.test.ts` if the `--import` form is broken on the installed tsx.
- **No default backfill for existing data** — the migration adds the columns with default 0. Existing rows will have `false` for everything. The defaults plan (#2) will retroactively patch lighterpack-imported rows by re-running import or by a one-shot SQL backfill. Do NOT attempt to backfill in this plan.

## Review

Implemented end to end. `npx tsc --noEmit`, `npm test` (5 passing), and `npm run build` all clean. Server migrations verified idempotent against both the existing dev DB and a fresh DB. `GET /api/lists/:id` returns the new raw fields (`itemAcquired`, `itemWeighed`, `ciAcquired`, `ciWeighed`, `packed`) plus computed `effective` and `writeTarget` per row. `PUT /api/items/:id` accepts `acquired`/`weighed`; `PUT /api/category_items/:categoryId/:itemId` accepts `acquired`/`weighed`/`packed`. Trip view renders three new columns (Acq/Wgh/Pkd) between Cons and Weight; cells are click-to-toggle with an optimistic update that dispatches to `patchItem` or `patchCategoryItem` based on the server-shipped `writeTarget`. Excluded rows render empty `<td>` cells.

Deviations from the plan, all documented in `docs/handoff/step-1-prep-foundation.md`:

- `CategoryItem` carries raw side-specific fields (`itemAcquired`, `itemWeighed`, `ciAcquired`, `ciWeighed`, `packed`) instead of collapsing to a single `acquired`/`weighed`/`packed` trio, to avoid the naming ambiguity. UI reads `effective.*` for display.
- `writeTarget` is computed server-side and shipped on the payload; client calls the resolver only from unit tests.
- `api.patchItem` is an alias for `api.updateItem` so both names resolve to the same endpoint.
- `GET /api/items`, `GET /api/items/all`, and `rowItem` were also extended to include `acquired`/`weighed` — required to satisfy the widened `Item` type. No behavior change beyond the extra columns in the SELECT and the response mapping.

Kept strictly out of scope: `RowEditModal` (step 5), lighterpack/template/clone backfill (step 2), progress counters (step 4), `/to-buy` (step 7).
