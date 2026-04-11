# Step 3 handoff — Row controls + leave-it-off state

## Scope

Replaced the plain `col-qty` number and the two-button `col-actions` cluster in `ItemRow` with a singleton-aware control cluster. Added a dimmed `.excluded` state for rows at `qty === 0`. Removed the always-on `×` unlink button; its DELETE is now reached only via `[Remove]` (🗑) which is shown only when `qty === 0`.

Files touched:

- `src/TripView.tsx` — `ItemRow` function only. Added `onPatchCi` to the destructure; rewrote `col-qty` and `col-actions` cells; applied `excluded` className to `<tr>`.
- `src/styles.css` — new rules for `.item-row.excluded`, `.qty-controls`, `.qty-num`, `.row-action.qty-step`, `.row-action:disabled`; widened `.col-qty` and `.col-actions`; made `.row-action` opacity 0.35-until-hover (was 0-until-hover); deleted `.item-row { cursor: pointer }` and the `.item-row-editing` rules.

No other files changed. No API changes. No changes to `categoryTotals`, the root `totals` useMemo, `patchCategoryItem`, or `unlinkItem`.

## Button/icon choice

Icons + `title`/`aria-label` tooltips, matching the pre-existing `✎` pencil style:

- `⊘` (U+2298) — Set to zero
- `↺` (U+21BA) — Keep it (restore to qty 1)
- `🗑` (U+1F5D1) — Remove
- `−` (U+2212) — Decrease qty (not hyphen-minus)
- `+` — Increase qty
- `✎` (U+270E) — Edit (pencil, unchanged from Step 2)

Reasoning: the surrounding `col-actions` already uses icon buttons. Text labels would look inconsistent and blow out the column width. The spec explicitly offered both options; icon-with-tooltip is more consistent with the existing affordance vocabulary. All icons have distinct `aria-label` and `title` for accessibility and hover tooltips.

## State → control mapping as implemented

Variables computed at the top of `ItemRow`:

```
const excluded = item.qty === 0;
const isSingletonDefault = item.singleton && item.qty === 1;
const showQtyControls = !excluded && !isSingletonDefault;
```

| State | `singleton` | `qty` | `col-qty` | `col-actions` |
|---|---|---|---|---|
| Singleton, included | true | 1 | (empty) | `⊘` Set to zero, `✎` Edit |
| Singleton, overridden | true | ≥2 | `− N +` | `⊘` Set to zero, `✎` Edit |
| Multi, included | false | ≥1 | `− N +` | `⊘` Set to zero, `✎` Edit |
| Excluded | — | 0 | (empty) | `↺` Keep it, `🗑` Remove, `✎` Edit |

The `−` button is `disabled` when `item.qty <= 1` (styled via `.row-action:disabled`). This matches the spec directive to disable rather than hide at qty=1 — explicit feedback that Set-to-zero is the path.

Wiring:

- **Set to zero** (`⊘`) → `onPatchCi({ qty: 0 })`
- **Keep it** (`↺`) → `onPatchCi({ qty: 1 })`
- **Remove** (`🗑`) → `onUnlink()` (same underlying DELETE as the old `×`)
- **+** → `onPatchCi({ qty: item.qty + 1 })`
- **−** → `onPatchCi({ qty: item.qty - 1 })` (guarded; disabled at qty≤1)
- **Pencil** (`✎`) → `onRequestEdit()` unchanged

All handlers call `e.stopPropagation()` matching existing pattern.

## Confirmations

- The `×` unlink button is GONE from `col-actions`. Confirmed.
- `🗑` Remove shows only at qty=0 (inside the `excluded` branch). Confirmed.
- `.excluded` class applies only when `item.qty === 0`. Confirmed.
- `categoryTotals` (lines 41–56) and the root `totals` useMemo (lines 238–253) were NOT modified. Both already exclude qty=0 rows by construction (`w = weight * qty`, `qty += it.qty`, `worn` has explicit `it.qty > 0` guard). Verified by inspection.
- `col-qty` renders nothing for singleton-qty=1 and nothing for qty=0 rows. I chose empty rather than `—` because the `opacity: 0.5 + line-through` already communicates "excluded" distinctly.
- `patchCategoryItem` and `unlinkItem` reused through the existing prop chain (`onPatchCi`, `onUnlink`). No new API paths introduced.

## CSS cleanups performed

- DELETED `.item-row { cursor: pointer; }` — row is no longer clickable (Step 2 removed the row click handler).
- DELETED `.item-row-editing { background: #f3f7fb; }` and its dark-mode sibling — dead code from Step 2's removal of inline edit mode.
- CHANGED `.row-action` default opacity from `0` to `0.35` — makes the always-on `⊘` / `↺` / `🗑` / `✎` visible without requiring hover, satisfying the spec's "subtle de-emphasis until hover" language. Row hover / focus still bumps to opacity 1.
- WIDENED `.col-actions` from `width: 2rem` to `width: auto; min-width: 4rem; text-align: right; white-space: nowrap; padding-right: 0.5rem;` — needed to accommodate the 2-button (or 3-button when excluded) cluster without wrapping.
- WIDENED `.col-qty` from `width: 3rem` to `width: auto; min-width: 4.5rem; white-space: nowrap;` — needed for the `− N +` cluster.

## New CSS rules added

```css
.row-action:disabled {
  opacity: 0.2 !important;
  cursor: not-allowed;
}
.row-action:disabled:hover { background: transparent; color: #888; }

.qty-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  justify-content: flex-end;
}
.qty-controls .qty-num {
  min-width: 1.25rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.row-action.qty-step {
  font-size: 1rem;
  padding: 0 0.3rem;
}

.item-row.excluded { opacity: 0.5; }
.item-row.excluded .col-qty,
.item-row.excluded .col-desc,
.item-row.excluded .col-weight,
.item-row.excluded .col-price { text-decoration: line-through; }
```

The `line-through` on excluded cells is additive to `opacity: 0.5` — the dim alone is clearly "de-emphasized" but line-through adds unambiguous "not counted" signal on the numeric cells, which is what the spec's headline use case (try-on configurations) benefits from.

## Deviations from the plan

None. All acceptance criteria that can be checked without a live browser are satisfied:

- Correct control cluster per state table: yes
- `.excluded` class applied when qty=0: yes
- `[Remove]` replaces `×` and only appears at qty=0: yes
- `−` at qty=1 disabled: yes
- Singleton at qty=1 shows only `⊘` + `✎`: yes
- Singleton at qty>1 and multi items show `− N +` + `⊘` + `✎`: yes
- Totals code untouched: yes
- AddItemModal flow untouched: yes
- `tsc --noEmit` clean: yes
- `npm run build` clean: yes

Browser smoke test deferred to the orchestrator per instructions (worktree does not run dev server).
