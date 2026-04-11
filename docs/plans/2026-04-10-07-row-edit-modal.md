# Row-edit modal replaces inline editing

## Parent spec

`docs/specs/2026-04-10-02-gear-quantity-controls.md`

## What to build

Replace the existing click-to-inline-edit behavior on item rows in `TripView.tsx` with a dedicated modal. A pencil icon on each row opens a `RowEditModal` that edits both sides of the row in one form:

- **Item library fields** (written via `PUT /api/items/:id`): name, description, weight + authorUnit, price, url, imageUrl, **singleton**.
- **Category_items fields** (written via `PUT /api/category_items/:categoryId/:itemId`): qty, worn, consumable.

The modal is reusable: feature #8's `/items` library screen will eventually open the same component for non-trip-contextual edits (qty/worn/consumable disabled or hidden there). This plan does NOT add that reuse — just build the modal so it's ready.

After this slice lands:

- Clicking an item row does NOT enter inline edit mode.
- Clicking the pencil icon on a row opens the modal.
- Saving the modal writes both halves via split API calls (sequential, not parallel, to keep error recovery simple) and updates the local optimistic mirror.
- Cancelling the modal discards all unsaved changes.
- All prior inline-edit functionality (edit name/desc/weight/price/qty/worn/consumable) is reachable via the modal.

No new row controls yet. No dimmed rows. No Add 1 / Set to zero buttons. Those are slice #3.

## Type

AFK

## Blocked by

- Blocked by `2026-04-10-06-singleton-flag-end-to-end.md` — the modal needs the `singleton` field and type.

## User stories addressed

- **Spec § Resolved Decisions — "Pencil opens a full row-edit modal"** — this slice builds the RowEditModal component and wires the pencil affordance.
- **Spec § Modules — RowEditModal** — this slice is the module.

## Acceptance criteria

- [ ] New `src/RowEditModal.tsx` component exists and is exported.
- [ ] Props: `{ categoryId: number; item: CategoryItem; onClose: () => void; onSaved: (patched: CategoryItem) => void }`.
- [ ] Modal renders all fields listed in "What to build" above, populated from the `item` prop.
- [ ] Save handler writes to both endpoints and calls `onSaved` with the updated row.
- [ ] Item library write uses the existing `PUT /api/items/:id`; category_items write uses the existing `PUT /api/category_items/:categoryId/:itemId`. No new endpoints.
- [ ] Cancel button and backdrop click both close without saving.
- [ ] `ItemRow` in `TripView.tsx` renders a pencil icon button in the actions column (next to the existing ×-unlink button).
- [ ] Clicking the pencil sets modal state in `TripView`, which renders the modal.
- [ ] Clicking anywhere else on a row no longer toggles edit mode. The existing `editingKey` state and `SortableItemRow`'s inline-edit branch are removed.
- [ ] Agent-browser smoke test: open a trip, click pencil on a row, change name + weight + qty + worn, save, confirm row reflects all changes, reload confirms persistence.
- [ ] `tsc --noEmit` clean. No console errors.

## Owns

- `src/RowEditModal.tsx` — new file. The modal component.
- `src/TripView.tsx` — specific sections:
  - `ItemRow` function (~line 513): delete the inline-edit branch entirely. The function now only renders the read-only row shape, with two action buttons in `col-actions`: the existing `×` unlink and a new pencil button.
  - `SortableItemRow`'s `ItemRowProps`: drop `editing`, `onEdit`, `onLeave`, `onPatchItem` props. Add `onRequestEdit`.
  - `CategorySection` (~line 393, wherever `editingKey` is threaded through): drop `editingKey`, `setEditingKey`, `onPatchItem` props. Add `onRequestEdit(categoryId, itemId)`.
  - The root `TripView` component: drop `editingKey` state entirely. Add `editTarget: { categoryId: number; itemId: number } | null` state. When set, render `<RowEditModal>` at the root. `onSaved` merges the patched row into the local optimistic mirror.
  - The click-outside `useEffect` inside `ItemRow` that handles leaving edit mode: delete.
  - Local draft state inside `ItemRow` (`name`, `desc`, `qty`, `weightVal`, `unit`, `price`) and their commit functions: delete.
- `src/api.ts` — verify the `send()` helper supports the two endpoints already. No new methods needed. If either write helper doesn't exist, add it.

## Must not touch

- `server/` — no API changes. Both endpoints already exist and already accept the fields this slice needs. `singleton` is in the body thanks to slice #6.
- `src/ItemLibrary.tsx` — the existing library editor stays as-is. The modal for this slice is a parallel implementation that borrows the field layout but does not import `ItemEditor` directly. (Rationale: ItemEditor is specialized for submit-via-form and doesn't render inside a modal; extracting the shared fields to a third component is out of scope. This is acceptable short-term duplication — feature #8 can dedupe later when it reuses this modal.)
- Row control layout for Add 1 / Set-to-zero / Keep-it / Remove / +/- — owned by plan `2026-04-10-08-row-controls-leave-off.md`. Only the pencil button lands here.
- Dimmed-row CSS or qty=0 behavior — owned by plan `2026-04-10-08`.
- `src/AddItemModal.tsx` — unrelated modal for adding items from the library. Do not modify.

## Defines interfaces

- **`RowEditModal` component** in `src/RowEditModal.tsx` — consumed by plan `2026-04-10-08` (the pencil affordance in the new control cluster still opens this modal) and by future feature #8 (library screen reuse).
- **Split-write convention for rows**: "item fields go to `/api/items/:id`, ci fields go to `/api/category_items/:catId/:itemId`, in that order, sequentially" — consumers need to know this if they want to extend the modal.

## Pattern exemplar

- **MUST follow the pattern in**: `src/ItemLibrary.tsx` `ItemEditor` component (~line 240) — copy the form layout (label-wrapped inputs, field-row for weight/unit/price, form-actions for buttons). The modal content is essentially this form rendered inside a modal shell.
- **Follow the pattern in**: `src/AddItemModal.tsx` — for the modal shell (backdrop, close-on-Escape, click-outside-closes). Match the modal open/close pattern including body scroll handling if it has any.
- **Follow the pattern in**: `src/TripView.tsx` existing `patchCategoryItem` function (~line 131) — this is how optimistic updates merge back into the local mirror. The `onSaved` callback should do the same merge for items that were edited through the modal.

## Tasks

- [ ] Create `src/RowEditModal.tsx` with the component skeleton: modal shell (copy AddItemModal shell), form body (copy ItemEditor fields), `singleton` checkbox (new).
- [ ] Add the three category_items fields (`qty`, `worn`, `consumable`) to the form. `qty` is a number input; `worn`/`consumable` are checkboxes.
- [ ] Implement `handleSave`: diff the form state against the `item` prop; build two patch objects (item fields vs ci fields); call `api.patchItem` with item patch if non-empty; call `api.patchCategoryItem` with ci patch if non-empty; call `onSaved` with the resulting shape.
- [ ] Close on Escape, close on backdrop click, close on Cancel button. Saving also closes on success.
- [ ] In `TripView.tsx`, add `editTarget` state (nullable) and a render block at the root that mounts `<RowEditModal>` when `editTarget` is set.
- [ ] Wire `onSaved` to merge the patched row into the local optimistic mirror (same style as existing `patchCategoryItem`).
- [ ] Delete the inline-edit branch in `ItemRow`: the entire `if (editing) { return ... }` block, the click-outside `useEffect`, the local draft `useState` calls, and the commit functions.
- [ ] Delete `editingKey` state and prop threading through `CategorySection` → `SortableItemRow` → `ItemRow`. Also delete the `onPatchItem` prop chain if it was only used by the deleted inline edit (grep for remaining callers — if nothing uses it, delete; if something else uses it, leave it).
- [ ] Add a pencil icon button in `col-actions` inside the read-only ItemRow. Clicking it calls `onRequestEdit(categoryId, itemId)`.
- [ ] Update `CategorySection` and `SortableItemRow` prop shapes to pass `onRequestEdit` instead of `editingKey`/`onEdit`/`onLeave`/`onPatchItem`.
- [ ] Run `tsc --noEmit`. Fix type errors from the prop shape changes.
- [ ] Agent-browser smoke test:
  - Open a trip
  - Click pencil on an item row → modal opens with fields populated
  - Change name, weight, qty, toggle worn → save
  - Row reflects new values
  - Reload page → values persist
  - Repeat: open pencil, click Cancel → no changes
  - Take screenshot: `row-edit-modal-open.png`
- [ ] Clean up any scratch data.

## Implementation notes

**Split-write order**: write item first, then category_item. If item write fails, don't write ci. If ci write fails after item succeeded, the user sees a partial-save error — acceptable for personal use, don't build rollback. Surface the error via the existing error banner pattern in TripView.

**Diffing form state against `item` prop**: only include fields in each patch that actually changed. Sending the whole form back on save works but is noisy and risks writing through stale fields. Compare each field to the original `item` value and include only diffs. Example shape:

```
const itemPatch: Partial<Item> = {};
if (name !== item.name) itemPatch.name = name;
if (weightMg !== item.weight) { itemPatch.weight = weightMg; itemPatch.authorUnit = unit; }
// ... etc
const ciPatch: Partial<CategoryItem> = {};
if (qty !== item.qty) ciPatch.qty = qty;
// ... etc
```

**`singleton` default for new items created through AddItemModal**: out of scope. That modal is untouched and its POST body doesn't send `singleton`, so the server defaults it to `true` (per slice #6). That's the correct behavior.

**Deleted code to verify**: after removing the inline-edit branch, grep for `editingKey`, `onEdit`, `onLeave`, `onPatchItem` in `TripView.tsx`. Each match should either be removed or should be a legitimate use somewhere else (unlikely — these were only for row inline edit). Clean up unused imports (`InlineText` may become unused for row context, leave if still used for list name / category name).
