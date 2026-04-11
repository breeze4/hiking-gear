# Batch C — Item library screen

A `/items` route to browse and manage the shared item library, with usage tracking and a delete guard.

## Scope

Backend:
- [ ] `GET /api/items/all` — items + usedIn count via LEFT JOIN, ORDER BY name COLLATE NOCASE
- [ ] `GET /api/items/:id/usage` — list of `{ listId, listName, categoryId, categoryName, qty, worn, consumable }`
- [ ] `DELETE /api/items/:id` — 409 with `{ error, usedIn: [...] }` if referenced; otherwise delete and 200

Frontend:
- [ ] New route `/items` in `App.tsx`. Topbar `Items` link next to `Templates`.
- [ ] `src/ItemLibrary.tsx`: sortable table (name, weight, price, used-in count). Click row to expand inline editor + usage list.
- [ ] Editor fields: name, description, weight + unit, price, url, imageUrl. Saves via `PUT /api/items/:id`.
- [ ] "+ New item" button at top opens the editor in create mode.
- [ ] Delete button on each row with `confirm()`. On 409, render usage list inline (not popup).
- [ ] Usage links: `<Link to="/?list=<id>">listName</Link>` so user can jump to the trip and clear the reference.

Verification:
- [ ] `npm run dev` clean
- [ ] Open `/items`, sort by name and used-in count
- [ ] Edit a real item's price (revert at end)
- [ ] Create "Library scratch item", confirm usedIn=0, delete it (succeeds)
- [ ] Try deleting a real referenced item — confirm 409 + inline usage list
- [ ] Screenshots: library-table, library-edit, library-usage, library-delete-blocked
- [ ] Cleanup: `DELETE FROM items WHERE name = 'Library scratch item'`

## Results

Shipped:

- Backend: `GET /api/items/all` (LEFT JOIN aggregate, NOCASE sort), `GET /api/items/:id/usage` (joined to lists+categories), `DELETE /api/items/:id` (returns 409 with `usedIn` array if referenced).
- Frontend: `src/ItemLibrary.tsx` with sortable table (Name, Weight, Price, Used in). Click row → expanded inline editor + usage panel. New item button at top opens an editor in create mode. Per-row Delete button confirms then either succeeds or surfaces an inline blocked-usage list with `<Link to="/?list=N">` for each referencing trip.
- Routes: `/items` added to `App.tsx`. `Items` link added to topbar nav next to `Templates`.
- API client + types: `Item`, `ItemUsage`, `ItemWithUsage` types; `itemsAll`, `itemUsage`, `deleteItem` methods. The shared `send()` helper attaches the response body to the thrown error so the library can read `error.data.usedIn` on 409.

Verification (agent-browser):

- Opened `/items`, table renders all 322 library items. Sorted by `Name` (default ASC), then by `Used in` (DESC) — top result is "Bladder 2L" with `usedIn=23`.
- Clicked "Bladder 2L" → editor + usage panel expanded; usage shows ~23 entries linking to trips. Edited price to 99.99, saved (verified in DB), then reverted via direct API call to 0 to leave the original state untouched.
- Created "Library scratch item" via the + New item form. New row showed `Used in = 0`. Clicked Delete → row disappeared, DB confirms removal.
- Tried to delete "Bladder 2L" → 409 from server, UI rendered the inline blocked-usage list ("Utah 7 days 2026 › Hydration", etc.). Item still in DB.
- Screenshots: `screenshots/library-table.png`, `library-edit.png`, `library-usage.png`, `library-delete-blocked.png`.
- TypeScript: `tsc --noEmit` clean. Only console error is the expected 409 from the blocked delete.
- Cleanup: scratch item removed; no rows added to lists/categories/category_items.

Deviations:

- Editing an item via the library editor sends ALL editor fields back via PUT (round-trip through the chosen unit dropdown). For weights stored at sub-mg precision, round-tripping through `toFixed(2)` in the displayed unit can drift the stored value by sub-mg. Acceptable for personal use; flag if you want exact-precision editing later.
- The expanded-row editor and the +New item form share the `ItemEditor` component, with `submitLabel` toggled. Spec said "the same editor in create mode" — done.

Open questions / spec notes:

- Blocked-delete UI shows `listName › categoryName` per row with a link to `/?list=<id>`. The spec mentioned `<Link to="/?list=<id>">` so the user can navigate to trips to clear the references — done. Once on the trip view, the user can use the row hover-X from Batch A to unlink, then return and retry the delete.

