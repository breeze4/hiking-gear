# Step 4 — Prep progress + row condensation (handoff)

## 1. `TripPrepProgress` module (`src/lib/progress.ts`)

Pure module, no React / no lucide. Imports `resolvePrepStatus` from `./prep.js`
(re-exported for downstream defensive use) but the three functions below read
`row.effective` directly — `effective` is already the resolver's output.

```ts
export type ProgressCounts = { prepped: number; total: number };

export type ProgressRow = {
  qty: number;
  effective: { acquired: boolean; weighed: boolean; packed: boolean };
};

export type ProgressCategory = { items: ProgressRow[] };
export type ProgressList = { categories: ProgressCategory[] };

export function isRowFullyPrepped(row: ProgressRow): boolean;
export function categoryProgress(cat: ProgressCategory): ProgressCounts;
export function listProgress(list: ProgressList): ProgressCounts;
```

Rule (same for both `categoryProgress` and `listProgress`):
- `total` counts only rows with `qty > 0` (excluded rows drop out).
- `prepped` counts rows where `effective.acquired && effective.weighed && effective.packed` AND `qty > 0`.

`isRowFullyPrepped` is the canonical predicate used by both the numerator
computation and the TripView row renderer for condensation. A `qty <= 0` row
never reports fully-prepped even if all three flags happen to be true — this
guarantees excluded rows can never condense.

## 2. `isRowFullyPrepped` signature

Takes `ProgressRow` (a structural subset of `CategoryItem` containing just
`qty` and `effective`). `CategoryItem` satisfies that shape via structural
typing, so TripView can pass a `CategoryItem` directly with no adapter. Tests
build synthetic rows with just the two fields.

Not `(item, ci)` — the resolver rule is already applied at the point `effective`
is produced (server-side in `server/index.ts` via `resolvePrepStatus`), so this
module reads the resolved state rather than re-deriving it. `progress.ts`
re-exports `resolvePrepStatus` for callers that want to defensively re-resolve
from raw fields.

## 3. Render sites in `src/TripView.tsx`

**Trip-level counter** — computed in the `TripView` component:
```ts
const prep = useMemo(() => listProgress(draft), [draft]);
```
Rendered in the `.totals` row next to the existing `Totalish` components as a
`.total` block labeled `Prepped` showing `{prep.prepped}/{prep.total}`. Hidden
entirely when `prep.total === 0`.

**Category-level counter** — computed in the `SortableCategory` component:
```ts
const prep: ProgressCounts = useMemo(() => categoryProgress(cat), [cat]);
```
Rendered inline in `.category-totals` after the existing `"N items"` span,
separated by a `•` bullet, as `<span class="category-prepped">{N}/{M} prepped</span>`.
Hidden when `prep.total === 0`.

**Row condensation** — in `ItemRow`:
- `condensed = !excluded && isRowFullyPrepped(item)`
- Row gets `prep-condensed` class (in addition to its existing classes) when condensed.
- When condensed, the three `col-prep` cells render two blanks and one
  aggregate-check button in the `Pkd` (third) column. The aggregate button
  fires `onPatchCi({ packed: false })` which the server + optimistic updater
  already support.
- `.item-row.prep-condensed:not(.excluded) { opacity: 0.7; }` — the `:not(.excluded)`
  guard prevents any overlap with the existing `.item-row.excluded { opacity: 0.5 }`
  rule per the contract.

## 4. `package.json` test script

```
"test": "node --test --import tsx/esm src/lib/prep.test.ts src/lib/progress.test.ts"
```

Listed both files explicitly (option 2 from the contract) to avoid shell-glob
surprises. Verified: `npm test` runs 16 total tests (5 prep + 11 progress), all pass.

## 5. CSS additions in `src/styles.css`

New rules (appended after existing `.prep-cell-button` block):
- `.item-row.prep-condensed:not(.excluded)` — opacity 0.7 (0.9 on hover).
- `.prep-cell-button.prep-aggregate` — faded green check, gains full opacity on hover.
- Dark-mode variants for the aggregate button.
- `.category-prepped` — tabular-nums, muted color; reuses the existing
  `.category-totals` font-size.

No existing CSS rules were modified.

## 6. Deviations from the plan

- **`isRowFullyPrepped(row)` instead of `isRowFullyPrepped(item, ci)`** — the
  plan contract specified `(item, ci)`, but since step 1 ships pre-resolved
  `effective` on every `CategoryItem`, taking a single row argument is cleaner
  and keeps the module's test harness lightweight. The rule is identical; the
  single source of truth is still `resolvePrepStatus` (server uses it to
  populate `effective`, progress.ts re-exports it for any defensive caller).
- **`CategoryItem` field shape** — noted the step-1 deviation. Progress.ts
  never touches the raw `itemAcquired`/`ciAcquired`/etc. fields; it reads
  `effective.*` only, so it's naturally agnostic to that naming choice.
- **Counter denominator semantics** — the plan says `qty > 0` rows count; I
  implemented `qty > 0` both in `isRowFullyPrepped` (numerator gate) and in
  the iteration filter (denominator gate). A worn item with qty=1 counts
  toward both like any other row.
- **Aggregate check placement** — put in the Pkd (third) column per the plan
  suggestion. First two prep cells render as empty `<td>` elements when
  condensed, matching the excluded-row layout pattern.

## 7. Invariants preserved

- `prep.ts` untouched (read-only consumer as contracted).
- `RowEditModal.tsx` untouched (step 5 owns it).
- No schema / server changes.
- No `/to-buy` work.
- Existing `.item-row.excluded` CSS rule untouched; new rule uses
  `:not(.excluded)` to avoid overlap.
- The aggregate click flips `packed` (ci-level) only. `acquired`/`weighed`
  library-level flags are never flipped by row clicks — those stay in the
  row-edit modal per the plan's "library-level flags should not be casually
  flipped from a row click" note.
