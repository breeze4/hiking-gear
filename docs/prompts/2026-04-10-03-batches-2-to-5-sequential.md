# Prompt: Implement remaining feature batches (2 → 5) in sequence

You are working on `hiking-gear`, a personal lighterpack clone. Your job is to ship four feature batches end-to-end, **in order**: edit primitives → reorder & lifecycle → item library → deployment. Each batch must be fully landed (planned, implemented, verified, cleaned up) before you start the next.

You are running in a fresh context. Read the spec and the existing code before assuming anything.

## Read first

1. `docs/specs/2026-04-10-01-hiking-gear.md` — full project spec. Read it.
2. `server/db.ts` — schema.
3. `server/index.ts` — current API.
4. `src/App.tsx`, `src/TripView.tsx`, `src/api.ts`, `src/types.ts`, `package.json` — current frontend wiring.

Skim, don't dive. Re-read targeted files as you start each batch.

## Critical: the template feature is already shipped in this branch — do not modify it

The template feature (catalog, detail view, create-trip-from-template) was implemented in batch 1 by a separate worker. It exists in your starting tree. Leave it alone:

- `src/TripHome.tsx`, `src/TemplatesList.tsx`, `src/TemplateDetail.tsx`, `src/NewTripFromTemplate.tsx`
- `server/import-template.ts`
- `server/db.ts`: the `templates`, `template_categories`, `template_items` tables and the `ALTER TABLE category_items ADD COLUMN priority` migration block
- `server/index.ts`: `GET /api/templates`, `GET /api/templates/:slug`, `POST /api/lists/from-template`
- `src/App.tsx`: do not remove `BrowserRouter`, the topbar `Templates` link, or the existing `/`, `/templates`, `/templates/:slug`, `/new-trip/:slug` routes. You may add new routes alongside them.
- Priority-pill rendering anywhere in `TripView.tsx`
- `reference/template/3-season.csv`

If you find a template-related bug, log it in your current batch's plan and move on. Do not fix it.

## Execution rules

- Each batch gets a plan file: `docs/plans/2026-04-10-NN-<slug>.md`. Use the next free NN at the time you write each one (check the dir).
- Per batch: write plan → implement → verify with `agent-browser` → clean up scratch data → append a "Results" section to the plan → start the next batch.
- Do not ask the user for approval between batches. Do not stop until all four are done or you hit a real blocker.
- If a batch is genuinely infeasible, stop, document the blocker in the plan, and report back.

## Conventions across all batches

- Stack locked: Node 22, Hono, better-sqlite3, Vite + React + TypeScript, react-router-dom. New deps only when explicitly listed in a batch's scope below.
- Schema changes must be additive and idempotent — check `PRAGMA table_info(...)` before `ALTER`.
- `data/hiking-gear.db` holds real user data. Never wipe it. Verify by inserting scratch rows with id ≥ 99000, then deleting them at end of verification. Don't run `npm run import` or `npm run import:template` during verification.
- No auth, no multi-user, no test framework, no state-management library, no UI component library.
- Edit existing files where possible. New files only for new components or endpoints.
- No comments explaining WHAT code does. Comment only non-obvious constraints.
- Don't refactor code outside the current batch's scope.
- Verify each batch with `agent-browser` (skill is configured). Save screenshots to `screenshots/<batch-prefix>-*.png`. Close the browser at the end of each batch.
- Don't commit or push. The user will handle git.

---

## Batch A — Edit primitives

CRUD APIs and inline-edit UI for lists, categories, items, and category-items. No reorder, no clone/delete, no item-library screen.

### API (add to `server/index.ts`)

- `PUT /api/lists/:id` — body `{ name?, description? }` — update list header. Returns updated summary.
- `POST /api/categories` — body `{ listId, name }` — append a category to the list (position = max + 1). Returns `{ id, listId, name, position }`.
- `PUT /api/categories/:id` — body `{ name? }`.
- `DELETE /api/categories/:id` — cascades via FK.
- `POST /api/items` — body `{ name, description?, weight?, authorUnit?, price?, url?, imageUrl? }`. Returns the new item.
- `PUT /api/items/:id` — body any subset of item fields.
- `GET /api/items?q=substring` — case-insensitive name search, max 50 results. Empty `q` returns the first 50 by name.
- `POST /api/category_items` — body `{ categoryId, itemId, qty?, worn?, consumable? }`. Position = max + 1. Returns the joined row matching the trip-view shape. 409 on duplicate (item already linked to that category).
- `PUT /api/category_items/:categoryId/:itemId` — body any subset of `{ qty, worn, consumable, star }`.
- `DELETE /api/category_items/:categoryId/:itemId`.

Validate input. Return 400 on bad input, 404 on missing ids. Wrap multi-statement updates in `db.transaction(...)`.

### Frontend

- `src/InlineText.tsx` — generic component: span on display, input or textarea on click, blur or Enter saves, Esc cancels. Supports a `multiline` prop. Faint dotted underline on hover.
- List name and description in `TripView.tsx` use `<InlineText>` → `PUT /api/lists/:id`.
- Category name uses `<InlineText>` → `PUT /api/categories/:id`. Hover-revealed delete button → `DELETE /api/categories/:id` with `window.confirm()`.
- "+ Add category" button after the last category → `POST /api/categories` → auto-focus the new name field for rename.
- Item row enters edit mode on click (per-row local state). All cells become inputs:
  - qty: number
  - name: text (edits the shared item via `PUT /api/items/:id`)
  - description: text
  - worn / consumable: checkboxes
  - weight: number paired with author-unit dropdown (`g`, `kg`, `oz`, `lb`) — convert to milligrams before saving
  - price: number
- Save-on-blur per field. Debounce text fields at ~400ms. Optimistic UI; rollback on error with a small inline banner.
- "+ Add item" at the bottom of each category opens `src/AddItemModal.tsx`: search input filters via `GET /api/items?q=...`. Click a result to link it. "Create new item" link opens an inline form (name, description, weight + unit, price, url) that creates the item and immediately links it.
- Hover-revealed X button on item rows → `DELETE /api/category_items/:categoryId/:itemId`. No confirm.

### Types & API client

Extend `src/types.ts` and `src/api.ts` with shapes and wrappers for the new endpoints.

### Verification

1. `npm run dev` — both servers boot, no TS errors, no console errors.
2. Insert a scratch list: `sqlite3 data/hiking-gear.db "INSERT INTO lists (id, name) VALUES (99001, 'Edit scratch'); INSERT INTO categories (list_id, name, position) VALUES (99001, 'Cat A', 0);"`.
3. Use `agent-browser` to switch to the scratch list and exercise: edit list name, edit description, add category, rename it, delete one, add an existing item, add a brand-new item, edit item fields, toggle worn/consumable, delete item. Verify totals update after each change.
4. Screenshots: `screenshots/edit-list-name.png`, `edit-add-category.png`, `edit-add-item-modal.png`, `edit-item-row.png`, `edit-trip-after.png`.
5. Cleanup: `DELETE FROM lists WHERE id = 99001` (cascades).
6. Close the browser.

### Plan file: `docs/plans/2026-04-10-NN-edit-primitives.md`

---

## Batch B — Reorder & trip lifecycle

Drag-reorder categories within a list and items within a category, plus clone / delete / archive on the trip itself.

### Schema

- `ALTER TABLE lists ADD COLUMN archived INTEGER NOT NULL DEFAULT 0` — idempotent (check `PRAGMA table_info`).

### API (add to `server/index.ts`)

- `PUT /api/lists/:id/category-order` — body `{ categoryIds: number[] }` — sets `categories.position` = index for that list. Transaction.
- `PUT /api/categories/:id/item-order` — body `{ itemIds: number[] }` — sets `category_items.position` = index for that category. Transaction.
- `POST /api/lists/:id/clone` — body `{ name? }` (default `"Copy of <original>"`). Clones list + categories + category_items. Shared items unchanged. Returns the new list summary.
- `DELETE /api/lists/:id` — deletes; cascades categories and category_items. Items in shared library are preserved.
- `PUT /api/lists/:id/archived` — body `{ archived: boolean }`.
- `GET /api/lists` — filter `archived = 0` by default. Add `?includeArchived=true` for all.

### Frontend

- `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.
- Categories: drag handle in category header. On drop, fire `PUT /api/lists/:id/category-order`.
- Items inside a category: drag handle on each row. On drop, fire `PUT /api/categories/:id/item-order`.
- Trip header gets a menu (ellipsis) with: Clone, Archive/Unarchive, Delete (with `confirm()`).
- List switcher: hides archived by default. Add a "Show archived" toggle (small checkbox or filter at the bottom of the dropdown). Archived lists, when shown, are visually muted.
- Clone navigates to the new list. Delete navigates to the highest remaining list.

### Types & API client

Extend as needed. `ListSummary` gains `archived: boolean`.

### Verification

1. `npm run dev`, no errors.
2. agent-browser: drag a category, drag an item, reload, confirm order persists. Insert a scratch list `id=99002`, clone it (verify the clone has the same structure but a fresh id), archive the clone (gone from switcher), toggle "Show archived" (visible, muted), unarchive, delete (gone for good).
3. Screenshots: `screenshots/reorder-categories.png`, `screenshots/reorder-items.png`, `screenshots/lifecycle-clone.png`, `screenshots/lifecycle-archived-list.png`.
4. Cleanup: `DELETE FROM lists WHERE id >= 99000 AND id < 100000`.
5. Close the browser.

### Plan file: `docs/plans/2026-04-10-NN-reorder-and-lifecycle.md`

---

## Batch C — Item library screen

A `/items` route to browse and manage the shared item library, with usage tracking and a delete guard.

### API (add to `server/index.ts`)

- `GET /api/items/all` — every item with `usedIn` count: `SELECT i.*, COUNT(ci.item_id) AS usedIn FROM items i LEFT JOIN category_items ci ON ci.item_id = i.id GROUP BY i.id ORDER BY i.name COLLATE NOCASE`.
- `GET /api/items/:id/usage` — returns `[{ listId, listName, categoryId, categoryName, qty, worn, consumable }]`.
- `DELETE /api/items/:id` — 409 with `{ error, usedIn: [...] }` if any `category_items` rows reference it; otherwise delete and return 200.
- `PUT /api/items/:id` is added in Batch A. If for any reason it isn't there yet, add it here.

### Frontend

- New route `/items` in `App.tsx`. Add an `Items` link in the topbar next to `Templates`.
- `src/ItemLibrary.tsx`: a sortable table of all items with columns name, weight (in `totalUnit`), price, used-in count. Sort by clicking column headers.
- Click a row to expand it inline showing: an editor (name, description, weight + unit, price, url, imageUrl) and a "Used in" list of `{ listName, categoryName }` with the list name as a `<Link to="/?list=<id>">`.
- "+ New item" button at the top opens the same editor in create mode.
- Delete button on each row. Confirm with `window.confirm()`. On 409, show the usage list inline (not a popup) so the user can navigate to the trips and clear the references.

### Types & API client

Extend.

### Verification

1. `npm run dev`, no errors.
2. agent-browser: open `/items`, sort by name and by used-in count, edit one real item's price (then revert to the original), create "Library scratch item", confirm `usedIn = 0`, delete it (succeeds), try deleting a real item that's referenced (confirm 409 + usage list inline).
3. Screenshots: `screenshots/library-table.png`, `screenshots/library-edit.png`, `screenshots/library-usage.png`, `screenshots/library-delete-blocked.png`.
4. Cleanup: `DELETE FROM items WHERE name = 'Library scratch item'`. Verify no real item state changed.
5. Close the browser.

### Plan file: `docs/plans/2026-04-10-NN-item-library.md`

---

## Batch D — Deployment

Production build, Hono serving the static SPA, and a deploy scaffold for the beebaby home server using the `deploy-to-beebaby` skill. **Do not actually deploy** — just scaffold.

### Build & serve

- `npm run build` should already invoke `vite build` (verify in `package.json`). Confirm the output goes to `dist/`.
- Add a `start` script: `"start": "NODE_ENV=production tsx server/index.ts"`.
- In `server/index.ts`, when `process.env.NODE_ENV === 'production'`:
  - Serve `dist/` as static files (use `serveStatic` from `@hono/node-server/serve-static`, or equivalent).
  - For non-API GET requests that don't match a static file, return `dist/index.html` so refresh on `/templates`, `/items`, etc. doesn't 404.
  - Skip the SPA fallback for any path starting with `/api`.
- In dev, behavior is unchanged — Vite still proxies.

### Deploy scaffold

- Invoke the `deploy-to-beebaby` skill. Configure for service name `hiking-gear`, port from env (default 3000), persistent volume for `data/hiking-gear.db`, deploy via rsync.
- Inspect what the skill produced: deploy script, systemd unit, any rsync excludes. Sanity-check it by reading the files. Don't run the deploy.

### Verification

1. `npm run build` completes with no errors. `dist/` exists with `index.html` and assets.
2. `NODE_ENV=production PORT=3001 npm run start` (or `tsx server/index.ts` with the env vars) — the server boots and serves the app on `:3001`.
3. agent-browser: open `http://localhost:3001/`, navigate `/`, `/templates`, `/items` (whichever batches have landed). Refresh on a deep route — confirm SPA fallback returns the SPA, not a 404. Hit `/api/lists` directly and confirm it returns JSON.
4. Screenshots: `screenshots/deploy-prod-home.png`, `screenshots/deploy-prod-deep-route.png`.
5. Inspect the systemd unit: `ExecStart`, `WorkingDirectory`, `Environment` (PORT, DB_PATH, NODE_ENV), `Restart=always`, `User=` matching beebaby setup.
6. Stop the production server. Close the browser.
7. **Do not run the deploy.** Report readiness in the plan.

### Plan file: `docs/plans/2026-04-10-NN-deployment.md`

---

## Final report

After all four batches land, write one short summary in your final chat message (under 250 words) listing:

- What shipped per batch
- Any deviations from this prompt and why
- Any open questions or follow-ups for the user
- Which screenshots are worth a look

## DO NOT (across all batches)

- Don't spawn sub-agents.
- Don't touch any file in the template off-limits list near the top of this prompt.
- Don't add deps not listed in your batch's scope.
- Don't refactor code outside your current batch.
- Don't run `npm run import` or `npm run import:template` during verification.
- Don't commit or push. The user will handle git.
- Don't write a README, deployment doc, or any markdown other than the per-batch plan files.
- Don't update CLAUDE.md or the project spec. If the spec is wrong, note it in the relevant plan's Results section so the user can fix it.
