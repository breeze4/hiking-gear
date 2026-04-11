# Step 2 handoff — Row-edit modal replaces inline editing

## 1. `RowEditModal` component

- **File**: `src/RowEditModal.tsx` (new).
- **Exported**: named export `RowEditModal`.
- **Props signature**:

```ts
type Props = {
  categoryId: number;
  item: CategoryItem;
  onClose: () => void;
  onSaved: (patched: CategoryItem) => void;
};
```

- **Close paths**: backdrop click, header ×, Cancel button, and Escape key all call `onClose()` without saving. (Escape is wired via a `useEffect` that attaches/detaches a `keydown` listener on `window`.)
- **Save path**: diffs form state against `item` prop, issues sequential writes (item then category_item), then calls `onSaved(patched)`. TripView's `onSaved` clears `editTarget`, so the modal does not call `onClose()` after a successful save (avoids double close).
- **Partial-save error handling**: on any thrown error during save, the modal sets local `error` state and clears `busy`. The modal stays open so the user sees what happened. No rollback of any already-succeeded write. Per-plan decision.

## 2. Split-write map

Item-library fields → `api.updateItem(item.itemId, itemPatch)` → `PUT /api/items/:id`:

- `name` (trimmed)
- `description`
- `weight` (milligrams, converted from the display unit)
- `authorUnit`
- `price`
- `url` (trimmed)
- `imageUrl` (trimmed)
- `singleton`

Category-items fields → `api.updateCategoryItem(categoryId, item.itemId, ciPatch)` → `PUT /api/category_items/:categoryId/:itemId`:

- `qty`
- `worn`
- `consumable`

Both patches are built via per-field diffs against the `item` prop; only changed fields are included. Item write happens first; category_item write happens second. If the item patch is empty, that endpoint is skipped (same for ci patch).

**API method names used**: `api.updateItem` and `api.updateCategoryItem`. The plan's mentions of `api.patchItem` / `api.patchCategoryItem` were stale — no such methods exist in `src/api.ts` and none were added.

## 3. `TripView.tsx` prop-chain changes

### Removed

- **State**: `const [editingKey, setEditingKey] = useState<string | null>(null);`
- **Helper function**: the entire `patchItem` function (was the shared-field write path for the deleted inline-edit mode).
- **Prop threading via `<SortableCategory>`**: `editingKey`, `setEditingKey`, `onPatchItem`.
- **Prop threading via `<SortableItemRow>`**: `editing`, `onEdit`, `onLeave`, `onPatchItem`.
- **`SortableCategoryProps` type fields**: `editingKey`, `setEditingKey`, `onPatchItem`.
- **`ItemRowProps` type fields**: `editing`, `onEdit`, `onLeave`, `onPatchItem`.
- **Inside `ItemRow`**: all local draft `useState` calls (`name`, `desc`, `qty`, `weightVal`, `unit`, `price`); the `useEffect` that synced drafts to props; the click-outside `useEffect` (which used `useRef` + `rowRef`); all commit functions (`commitName`, `commitDesc`, `commitQty`, `commitWeight`, `commitPrice`); the entire `if (!editing) { return ... }` branching and the second edit-mode `return (...)` JSX (the editable inputs table row).
- **Row click handler**: `onClick={onEdit}` on the `<tr>` in the read-only path.
- **Imports**: `useRef`, `WEIGHT_UNITS`, `unitToMg` from the TripView imports (they were only used by the now-deleted inline edit mode).

### Added

- **State**: `const [editTarget, setEditTarget] = useState<{ categoryId: number; itemId: number } | null>(null);`
- **Import**: `import { RowEditModal } from './RowEditModal';`
- **`SortableCategoryProps`**: `onRequestEdit: (itemId: number) => void;`
- **`ItemRowProps`**: `onRequestEdit: () => void;`
- **Prop passed to `<SortableCategory>`**: `onRequestEdit={(itemId) => setEditTarget({ categoryId: cat.id, itemId })}`.
- **Prop passed to `<SortableItemRow>`**: `onRequestEdit={() => onRequestEdit(it.itemId)}`.
- **Pencil button** in `<td className="col-actions">` — placed BEFORE the existing `×` unlink button. Glyph: `✎` (U+270E). Classes/layout reused from the existing `row-action` class — no CSS changes. `onClick` calls `e.stopPropagation()` then `onRequestEdit()` (stopPropagation is vestigial since the `<tr>` no longer has an onClick, but kept as defensive hygiene matching the unlink button).
- **`<RowEditModal>` render block** at the TripView root, mounted immediately after the existing `<AddItemModal>` block. Looks up the live `CategoryItem` from `draft` each render (so it sees any in-flight optimistic updates), and in `onSaved` patches the local `draft` state by id-matching into the right category.

## 4. Unlink button status

The existing `×` unlink button is STILL present inside `<td className="col-actions">`, rendered immediately after the new pencil button. Markup shape:

```tsx
<td className="col-actions">
  <button ... aria-label="Edit item">✎</button>
  <button ... aria-label="Remove item">×</button>
</td>
```

Step 3 can verify this starting state before its own changes to `col-actions`.

## 5. Deviations from the plan

- The plan file referenced `api.patchItem` / `api.patchCategoryItem`; those methods do not exist. Used the real `api.updateItem` / `api.updateCategoryItem` methods. No new methods or aliases were added to `src/api.ts`.
- Weight-input value-parsing: when the user-typed weight is non-finite, the modal falls back to the original `item.weight` (millimeters) rather than coercing to 0. Same for price. This preserves current row values if the input box was cleared and re-submitted empty; it's a minor robustness choice on top of the diff logic. The plan does not specify this edge case either way.
- No other deviations.

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npm run build`: exit 0 (`dist/assets/index-*.js` produced).
- No browser smoke from the worktree, per instructions.
