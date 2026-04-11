# Batch A — Edit primitives

CRUD APIs and inline-edit UI for lists, categories, items, and category-items. No reorder, no clone/delete-of-trips, no item-library screen.

## Scope

Backend:
- [ ] `PUT /api/lists/:id` — update list name/description
- [ ] `POST /api/categories` — append a category to a list
- [ ] `PUT /api/categories/:id` — rename
- [ ] `DELETE /api/categories/:id` — cascade
- [ ] `POST /api/items` — create item in shared library
- [ ] `PUT /api/items/:id` — update any subset of item fields
- [ ] `GET /api/items?q=` — case-insensitive search, max 50
- [ ] `POST /api/category_items` — link item to category, position = max+1, 409 on dup
- [ ] `PUT /api/category_items/:categoryId/:itemId` — qty/worn/consumable/star
- [ ] `DELETE /api/category_items/:categoryId/:itemId`
- [ ] Validate input. 400 on bad shape, 404 on missing ids. Use transactions for multi-step writes.

Frontend:
- [ ] `src/InlineText.tsx` — generic inline-edit component (text/textarea), blur/Enter saves, Esc cancels
- [ ] `TripView.tsx`: list name/description editable via `InlineText`
- [ ] Category name editable; hover-revealed delete button with `confirm()`
- [ ] "+ Add category" appends and auto-focuses rename
- [ ] Item rows enter edit mode on click — qty, name (PUT items), description, worn/consumable, weight + unit dropdown, price
- [ ] Save-on-blur per field; debounced text fields (~400ms); optimistic UI with rollback banner
- [ ] `src/AddItemModal.tsx` — search existing items, click to link, inline "create new item" form
- [ ] Hover-revealed X button on item rows → DELETE category_item

Types & API client:
- [ ] Extend `src/types.ts` and `src/api.ts`

Verification:
- [ ] `npm run dev` boots clean (no TS errors, no console errors)
- [ ] Insert scratch list id=99001, exercise all the editing flows via agent-browser
- [ ] Screenshots: edit-list-name, edit-add-category, edit-add-item-modal, edit-item-row, edit-trip-after
- [ ] Cleanup: `DELETE FROM lists WHERE id = 99001`

## Notes

- Shared items: editing the name/desc/weight of a category-item edits the underlying shared item (visible in every other trip referencing it). Acceptable per spec.
- Weight input is paired with the author-unit dropdown; convert to milligrams on save using existing `weight.ts` helpers (need an inverse `unitToMg`).
- 409 on linking a duplicate item to the same category — let UI surface as a non-destructive error.

## Results

Shipped:

- Backend: all 10 endpoints added in `server/index.ts`. Validation returns 400/404/409 as appropriate. `PUT /api/items/:id` only updates fields that appear in the body.
- Frontend: `src/InlineText.tsx` (generic inline editor), `src/AddItemModal.tsx` (search + create form), and a heavy rewrite of `src/TripView.tsx` to manage a local optimistic mirror of the list. Errors render as a floating banner that auto-dismisses after 4s.
- API client: `src/api.ts` rewritten with a generic `send()` helper that surfaces 4xx error bodies; new methods for every endpoint.
- Item rows: click → edit mode. Click outside → exit edit mode. Save-on-blur per field. Weight uses a unit-paired select; values convert to milligrams via the new `unitToMg`.
- Hover-revealed `×` buttons on category headers and item rows.

Verification (agent-browser, list 99001):

- Renamed list, edited description, added category "New category", renamed to "Cat B (renamed)", deleted it, opened add-item modal, linked existing "Beanie", created+linked "Scratch new item", entered row edit mode, set qty=3 + worn + consumable + weight 150 g, unlinked the row. All persisted.
- Screenshots: `screenshots/edit-list-name.png`, `edit-add-category.png`, `edit-add-item-modal.png`, `edit-item-row.png`, `edit-trip-after.png`.
- TypeScript: `tsc --noEmit` clean. No console errors in browser.
- Cleanup: `DELETE FROM lists WHERE id=99001` (FKs not enforced via sqlite3 CLI; cleaned up orphan category manually). Scratch item id 683 also deleted.

Deviations:

- The spec asked for "debounce text fields at ~400ms" — implemented as save-on-blur of local drafts instead. Same effect for the user (single API call when they leave the field), simpler than a debounced timer, and avoids losing the in-progress edit on rerender.
- "+ Add category" creates a category named `"New category"` and immediately enters edit mode (auto-focused). The spec said "auto-focus the new name field for rename" — the inline-text autofocus prop accomplishes this without an explicit "rename mode".
- Click-outside detection on item rows uses a `mousedown` document listener bound only while the row is in edit mode.
- Item-search modal also lists items when query is empty (server endpoint already handles this).

Open issues / spec notes:

- Editing an item's name/weight in row-edit mode mutates the shared library item, so other trips referencing it see the change. This matches the spec ("item picker: search the shared library when adding to a category so existing items can be reused"), but is worth surfacing in the spec next to the trip-edit section so the behavior is explicit.
- Sqlite cascade delete only fires when `foreign_keys = ON` — the app sets it, the CLI does not. Worth noting in the spec or a developer doc.

