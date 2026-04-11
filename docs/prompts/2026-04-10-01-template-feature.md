# Prompt: Implement the template feature end-to-end

You are working on `hiking-gear`, a personal lighterpack clone. The foundation is done — you are building one vertical feature on top of it. Your job: ship the **template feature** end-to-end, from DB to API to UI, including a browsable template catalog and a "create trip from template" flow.

Work autonomously. Do not wait for approval between steps. When you are done, the user will review the whole thing together.

## Read these first (in order)

1. `docs/specs/2026-04-10-01-hiking-gear.md` — project spec. Read the whole thing; it's short. The "Template browse + create-trip-from-template" section in "Next up" is the feature you're building. The "Open questions" section at the bottom leans toward certain answers — follow those.
2. `server/db.ts` — current schema, including the `templates` / `template_categories` / `template_items` tables (already created and populated).
3. `server/index.ts` — current API. `GET /api/templates` and `GET /api/templates/:slug` already exist.
4. `server/import-template.ts` — the template is already imported from `reference/template/3-season.csv`. Don't change this unless you find a bug.
5. `src/App.tsx`, `src/TripView.tsx`, `src/api.ts`, `src/types.ts` — how the frontend is wired today.

Don't read anything else unless a specific task requires it. The `reference/` dir is a gitignored third-party copy; don't read it for this task.

## Write a plan first (but don't wait for approval)

Before you code, write a short implementation plan to `docs/plans/2026-04-10-01-template-feature.md`. List:

- Schema changes you're making
- New API endpoints (method, path, request shape, response shape)
- New React screens and the routing approach
- Verification steps
- Any open questions you encountered and how you resolved them

Then proceed directly to implementation. Treat the plan as a record of what you intend to build — update it in place if reality diverges. Do not ask the user to approve it before you start.

## What "end to end" means

### Schema
- Add a nullable `priority` TEXT column on `category_items`. When a trip is created from a template, the chosen priority level is stored here so the trip view can later filter by priority. The migration must be idempotent (check if the column exists before adding it) because the DB at `data/hiking-gear.db` holds real user data — you cannot wipe it.
- The `templates` / `template_categories` / `template_items` tables already exist. Don't alter them.

### Backend (`server/index.ts`)

Add one endpoint: `POST /api/lists/from-template`. Body shape:

```
{
  "slug": "3-season",
  "name": "My new trip",
  "itemIds": [12, 15, 18, ...]   // template_items.id values the user opted into
}
```

Behavior:
- Allocate a new list id (max(id) + 1 so it sorts above existing trips in the newest-first UI).
- For each template category that has at least one selected item, create a new `categories` row on the new list, preserving the template's category order.
- For each selected template item, in that category's order:
  - Find-or-create an item in the shared `items` library by case-insensitive name match. New items start with `weight=0`, `author_unit='oz'`, `description` copied from the template item's description, and everything else empty.
  - Insert a `category_items` row with `qty=1`, `worn=0`, `consumable=0`, `star=0`, `position` in order, and `priority` = the template item's priority.
- Wrap the whole thing in `db.transaction(...)` so partial failures roll back.
- Return `{ id, name }` of the new list on success. Use 400 on a missing/unknown slug, empty itemIds, or missing name.

Also update `GET /api/lists/:id` to include `priority` on each category item in the response (nullable).

### Frontend

Add client-side routing with `react-router-dom` (add to `dependencies`; run `npm install react-router-dom`). Routes:

- `/` — current trip view (unchanged behavior).
- `/templates` — template catalog.
- `/templates/:slug` — template detail.
- `/new-trip/:slug` — create-trip form.

Keep router setup in `App.tsx`. Move current landing-page logic into a `<TripHome>` component if it makes the router cleaner, but keep file count low.

**Templates catalog** (`/templates`)
- Fetch `GET /api/templates`.
- Show a list: template name, source link (if present), category count, item count.
- Each row links to `/templates/:slug`.

**Template detail** (`/templates/:slug`)
- Fetch `GET /api/templates/:slug`.
- For each category: header with name, then items grouped by priority. Priority order: Critical, Contingent, Suggested, Optional, Unnecessary.
- Each item shows name, priority pill (colored by level), description, example.
- A "New trip from this template" button links to `/new-trip/:slug`.

**New-trip form** (`/new-trip/:slug`)
- Fetch the template.
- Text input for trip name (required).
- For each category: list items with checkboxes. Default-checked: Critical and Contingent. Default-unchecked: Suggested and Optional. Hidden by default: Unnecessary, with a "Show unnecessary items" toggle that reveals them (still defaulting unchecked).
- Running counter at the top: "X items selected across Y categories".
- "Create trip" button POSTs to `/api/lists/from-template`. On success, navigate to `/?list=<newId>` and the trip view should land on the new list.
- On error, show the message inline; don't lose the user's selections.

**Trip view** (existing, `TripView.tsx`)
- When a category item has a non-null `priority`, show a small colored pill next to the item name. Colors: Critical=red, Contingent=orange, Suggested=yellow, Optional=gray, Unnecessary=light gray. Don't make it flashy — just a small chip.
- The default-list selection in `App.tsx` should honor a `?list=<id>` query param if present, so the new-trip flow can land directly on the created trip.

### Types & API client
- Extend `src/types.ts`:
  - `CategoryItem` gets an optional `priority?: Priority | null`.
  - Add a `Priority` union type: `'Critical' | 'Contingent' | 'Suggested' | 'Optional' | 'Unnecessary'`.
- Extend `src/api.ts` with `createFromTemplate(body)` wrapping the new POST.

### Styling
- Reuse `src/styles.css`. Add classes as needed; don't start a new stylesheet or pull in a component library.
- Colors: match the existing palette. Priority pills can be flat colored backgrounds with a bit of padding and rounded corners. Keep it simple.

## Conventions and guardrails

- **Stack is locked**: Node 22, Hono, better-sqlite3, Vite+React+TS. Only new dep allowed: `react-router-dom`.
- **No auth, no multi-user.** Skip it entirely.
- **Don't refactor unrelated code.** Keep changes scoped to the template feature.
- **No test framework.** Verify manually via `agent-browser`.
- **Don't touch the weight math in `TripView.tsx`** except to add the priority pill.
- **Data preservation.** The SQLite DB at `data/hiking-gear.db` has real user data. Schema changes must be additive and idempotent. Don't wipe anything.
- **Edit existing files** when possible. New files only for new screens/components.
- **No comments explaining what the code does.** Only comment non-obvious constraints.
- **Check the `--env-file=.env` pattern** in existing scripts before running any script that touches env.

## Verification

Before you report done:

1. `npm run import` and `npm run import:template` should still succeed cleanly (your migration must not break reimport).
2. Start servers: `npm run dev`. No TypeScript errors. No console errors on boot.
3. Use `agent-browser` (the skill is already configured) to walk the full flow:
   - Open `http://localhost:5173/templates`. Click into `3-Season Backpacking`. Screenshot to `screenshots/template-detail.png`.
   - Click "New trip from template". Type name "Template test trip". Uncheck one Contingent item. Check one Suggested item. Submit. Screenshot `screenshots/template-new-trip.png` before submitting.
   - Verify you land on the new trip view and the selected items are present under the right categories with priority pills. Screenshot `screenshots/template-created-trip.png`.
   - Switch lists via the topbar dropdown and come back. The trip should persist.
4. Query the DB to confirm: `sqlite3 data/hiking-gear.db "SELECT l.id, l.name, COUNT(ci.item_id) FROM lists l JOIN categories c ON c.list_id=l.id JOIN category_items ci ON ci.category_id=c.id WHERE l.name='Template test trip' GROUP BY l.id"` — should show the right item count. Also check `SELECT COUNT(*) FROM category_items WHERE priority IS NOT NULL` is > 0.
5. Clean up: `sqlite3 data/hiking-gear.db "DELETE FROM lists WHERE name='Template test trip'"` so the DB is clean.
6. Close the browser.

## Reporting back

Append a short "Results" section to `docs/plans/2026-04-10-01-template-feature.md` with:

- Files created/modified (one-line each)
- What deviated from the plan and why
- Anything the user should know or decide next

Then summarize in your final chat message — under 200 words, no fluff.

## What NOT to do

- Don't spawn sub-agents. Do the work yourself.
- Don't build item-library management, trip lifecycle (clone/delete/archive), or any other "Next up" item from the spec.
- Don't optimize for production.
- Don't introduce a state-management library. `useState` / `useEffect` is enough.
- Don't add auth, even a placeholder.
- Don't write a README.
- Don't touch `scripts/export-lighterpack.mjs` or the import scripts unless you find a real bug.
- Don't update CLAUDE.md, the spec, or any existing docs — if the spec is wrong, note it in your Results section and let the user fix it.
