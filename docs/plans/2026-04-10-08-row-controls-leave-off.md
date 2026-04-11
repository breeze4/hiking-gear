# Singleton-aware row controls + leave-it-off state

## Parent spec

`docs/specs/2026-04-10-02-gear-quantity-controls.md`

## What to build

Replace the plain qty-number-display in each item row with a singleton-aware control cluster, and make `qty=0` a first-class "leave it off" state with dimmed rendering and dedicated buttons. This is the visible user-facing payoff of the feature.

State → control mapping (from spec § Behavior):

| State | `singleton` | `qty` | Controls shown |
|---|---|---|---|
| Singleton, included | true | 1 | `[Set to zero]` button + pencil (from slice #7) |
| Singleton, overridden | true | >1 | Qty number + `+`/`–` buttons + `[Set to zero]` + pencil |
| Multi, included | false | ≥1 | Qty number + `+`/`–` buttons + `[Set to zero]` + pencil |
| Either, excluded | — | 0 | Row **dimmed** (CSS class). Controls: `[Keep it]` + `[Remove]` + pencil |

Semantics:

- **Set to zero** → writes `qty=0` via existing `PUT /api/category_items/:catId/:itemId`. Row dims in-place.
- **Keep it** → writes `qty=1`. Same action as the "Add 1" button from the item picker (which already exists).
- **Remove** → deletes the category_item via existing `DELETE /api/category_items/:catId/:itemId` (same call as the existing × unlink).
- **`+`/`–`** → increments / decrements qty via PUT. `–` at qty=1 is disabled (user should use Set-to-zero explicitly). `–` at qty=0 is impossible (controls differ at qty=0).
- **Pencil** (already placed in slice #7) → opens the row-edit modal. Unchanged.

After this slice: the existing `×` unlink button in `col-actions` is gone — its function is absorbed by `[Remove]` (which only shows when `qty=0`). This is a behavior change: you can no longer one-click delete an included item. You must Set-to-zero first, then Remove. The spec accepted this tradeoff by making Set-to-zero the primary "get rid of this" action.

No backend changes. Items count keeps working by construction (`Σ qty`, qty=0 contributes 0).

## Type

AFK

## Blocked by

- Blocked by `2026-04-10-06-singleton-flag-end-to-end.md` — needs `item.singleton`.
- Blocked by `2026-04-10-07-row-edit-modal.md` — the pencil icon is placed there; this slice only rearranges the surrounding control cluster.

## User stories addressed

- **Spec § Problem, bullet 1** — most gear is qty=1; reduce friction to add.
- **Spec § Problem, bullet 2** — "trying on" configurations without losing items.
- **Spec § Solution, bullet 2** — `qty=0` as a persistent leave-it-off state.
- **Spec § Behavior — Row controls by state** — the full state→control table above.

## Acceptance criteria

- [ ] Each row renders the correct control cluster based on `item.singleton` and `item.qty`, per the table above.
- [ ] Dimmed-row CSS class applied when `qty === 0`. Row text/weights visually de-emphasized (opacity ~0.5 or a `.excluded` class).
- [ ] Clicking `[Set to zero]` writes `qty=0` and the row immediately re-renders as dimmed with `[Keep it]`/`[Remove]` controls.
- [ ] Clicking `[Keep it]` on a dimmed row writes `qty=1` and the row re-renders as included.
- [ ] Clicking `[Remove]` on a dimmed row deletes the category_item (`DELETE` endpoint) — row disappears.
- [ ] Clicking `+` increments qty by 1 via PUT. Clicking `–` at qty≥2 decrements by 1. Clicking `–` at qty=1 is disabled (grayed out, not clickable).
- [ ] Singleton items at qty=1 show ONLY `[Set to zero]` + pencil (no `+`/`–` and no qty number — the "1" is implicit, and the modal pencil is the override path for the rare qty>1 case).
- [ ] Singleton items at qty>1 (overridden via pencil) show the same layout as multi items: qty number + `+`/`–` + Set to zero + pencil.
- [ ] Multi items always show qty number + `+`/`–` + Set to zero + pencil.
- [ ] The existing `×` unlink button in `col-actions` is removed. `[Remove]` replaces it and only appears at qty=0.
- [ ] Totals (Base/Worn/Consumable/Pack/Total) exclude qty=0 rows by existing formula — verify visually, no code change.
- [ ] Items count in the totals row excludes qty=0 by existing `Σ qty` computation — verify visually, no code change.
- [ ] The "+ Add item" category-footer button and AddItemModal flow are unchanged — when a new item is linked to a category via the existing `POST /api/category_items`, it lands with qty=1 and shows the singleton-aware controls.
- [ ] Dimmed rows persist across page reloads (proof that `qty=0` is in the DB).
- [ ] Cloning a trip preserves dimmed rows (out of scope for this plan, but should work by data alone — verify if a clone feature exists).
- [ ] Agent-browser smoke test covers every state in the table above.

## Owns

- `src/TripView.tsx` — specific functions only:
  - `ItemRow` function: rewrite `col-qty` and `col-actions` rendering to emit the state-dependent control cluster. The read-only row render stays read-only except for the control cluster. Name/description/weight/price/worn/cons columns are unchanged (read-only display; pencil opens modal for edits).
  - `ItemRow`: apply a `.excluded` className to the `<tr>` when `qty === 0`.
  - `ItemRow`: delete the existing unlink `×` button from `col-actions`. Keep the pencil button from slice #7 in `col-actions`.
  - Add small handler callbacks passed through props: `onSetZero(itemId)`, `onKeepIt(itemId)`, `onRemove(itemId)`, `onIncQty(itemId)`, `onDecQty(itemId)`. Each is a thin wrapper that calls the existing `patchCategoryItem` or unlink helper.
  - Wire these callbacks from `TripView` → `CategorySection` → `SortableItemRow` → `ItemRow`. Or consolidate into a single `onCiAction(itemId, action: 'zero' | 'keep' | 'remove' | 'inc' | 'dec')` prop to avoid prop explosion — implementer's call.
- `src/styles.css` — add `.item-row.excluded { opacity: 0.5; }` (or similar — pick a visual that works with the existing row hover state). Add button styles for the new `[Set to zero]`, `[Keep it]`, `[Remove]` buttons, consistent with existing row-action button styles.

## Must not touch

- `server/` — no API changes. All actions use existing endpoints.
- `src/RowEditModal.tsx` — fully owned by slice #7. The pencil opens it; this slice does not modify it.
- `src/types.ts` — `singleton` field added in slice #6, already present.
- `src/AddItemModal.tsx` — unchanged. New items land with qty=1 from the existing POST default, which is the correct new behavior.
- `src/ItemLibrary.tsx` — unchanged. Library-level editing continues through `ItemEditor`.
- The totals calculation in `TripView.tsx` (~line 261-275) — already correct. Do NOT "fix" it; verify it works.
- The `patchCategoryItem` function (~line 131) — it's the underlying primitive for the new action callbacks. Do not rewrite it.
- `src/TripView.tsx` `catTotals` and similar read-side formulas — already handle qty=0 by construction.

## Defines interfaces

None — this plan only consumes existing interfaces (`item.singleton` from slice #6, `patchCategoryItem` and DELETE helpers already in TripView, `RowEditModal` from slice #7).

## Pattern exemplar

- **Follow the pattern in**: `src/TripView.tsx` existing `patchCategoryItem` function (~line 131) — the action callbacks in this slice are all thin wrappers that delegate to this or to the existing unlink helper. Don't invent a new write path.
- **Follow the pattern in**: `src/TripView.tsx` existing `col-actions` cell rendering (the `×` button at ~line 606) — for button markup style, `stopPropagation` usage, and the `row-action` className convention.
- **Follow the pattern in**: `src/styles.css` existing `.item-row` rules — match the existing row styling conventions for the `.excluded` modifier.
- **None — first of its kind** for the control-cluster composition logic. The state→control table in this plan IS the spec for that component. Keep the logic inline in `ItemRow` unless it grows unwieldy; extraction to a `RowControls` subcomponent is acceptable but optional.

## Tasks

- [ ] Add `.item-row.excluded { opacity: 0.5; }` to `src/styles.css`. Verify it doesn't clash with the existing row hover state.
- [ ] In `TripView.tsx`, add callback handlers (either five discrete ones or one dispatcher `onCiAction`). Each calls existing `patchCategoryItem` or the existing unlink helper.
- [ ] Thread the callbacks through `CategorySection` → `SortableItemRow` → `ItemRow` props.
- [ ] In `ItemRow`, apply `excluded` className when `item.qty === 0`.
- [ ] In `ItemRow`, replace the `col-qty` cell content with the state-appropriate qty display: nothing for singleton-qty=1 (or "1" muted), `qty` number for multi/overridden, empty/"—" for qty=0.
- [ ] In `ItemRow`, replace the `col-actions` cell content with the state-appropriate button cluster, keeping the pencil (from slice #7) present in every state.
- [ ] Delete the existing `×` unlink button from `col-actions`. If any prop wiring for `onUnlink` is now only used by `Remove`, keep it (Remove calls the same delete endpoint); if it's now dead, clean up.
- [ ] `–` button at qty=1 must be disabled (not hidden — explicit feedback that Set-to-zero is the path).
- [ ] `tsc --noEmit` clean.
- [ ] Agent-browser smoke test:
  - Insert or use a scratch trip with a mix of singleton and multi items
  - Confirm singleton items at qty=1 show only Set-to-zero + pencil
  - Click Set-to-zero → row dims, Keep it + Remove appear, totals drop
  - Click Keep it → row re-includes, totals restore
  - Click Set-to-zero again → dim. Click Remove → row gone
  - For a multi item, click + → qty increments, totals grow. Click – → decrements. At qty=1, – is disabled.
  - Reload the page → any row left at qty=0 is still dimmed (persistence check)
  - Take screenshots: `row-controls-included.png`, `row-controls-dimmed.png`, `row-controls-multi.png`
- [ ] Clean up any scratch data.
- [ ] Verify items count in the totals row matches what you'd expect with some rows at qty=0 — should exclude them by `Σ qty`. If it doesn't (shouldn't happen — the sum already handles it), surface as a bug, not a fix-in-this-plan.

## Implementation notes

**Control cluster layout**: keep the qty column (`col-qty`) for the qty number display when it's shown, and put the action buttons in the actions column (`col-actions`). That preserves the table layout. Buttons can stack vertically in `col-actions` if needed, or flow horizontally — match whatever the existing `×` button style suggests.

**Button labels**: the spec uses `[Set to zero]`, `[Keep it]`, `[Remove]`. Keep the labels literal as shown — they're short enough to fit in the actions column. If space is tight, consider icon-only with tooltips: `⊘` for set-to-zero, `↺` for keep-it, `🗑` for remove. Either is acceptable; icon-with-tooltip is more consistent with the existing `×` button style. Pick one and be consistent.

**Disabled `–` at qty=1**: use the standard `disabled` attribute on the button. Styling is automatic if row-action styles already handle `[disabled]`; add a rule if not.

**Optimistic update for destructive actions**: Set-to-zero is non-destructive (reversible via Keep it), so treat it like any other qty PUT — optimistic. Remove is destructive (deletes the row) but already has prior-art optimistic handling via the existing unlink button. Match that.

**Totals verification (visual, no code)**: after this slice lands, open a trip, set a heavy item to zero, confirm Total drops by that item's weight, Items count drops by that item's original qty, and the dimmed row is still visible. Do the reverse with Keep it. This is the spec's headline use case — make sure it works.

**No migration or backfill**: this slice changes no data and adds no columns. Every affordance is derived from existing `qty` and the `singleton` field added in slice #6.
