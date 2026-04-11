---
slug: template-feature
status: complete
---

# Template feature — implementation plan

End-to-end template browse + create-trip-from-template flow on top of the
existing schema/import.

## Schema

- `category_items.priority TEXT NULL` — added in `server/db.ts` after the main
  `CREATE TABLE` block via `PRAGMA table_info(category_items)` check, then
  `ALTER TABLE category_items ADD COLUMN priority TEXT` only if missing. Must be
  idempotent (real DB at `data/hiking-gear.db` cannot be wiped).
- No changes to `templates` / `template_categories` / `template_items`.

## Backend

### `POST /api/lists/from-template`

Request body:

```
{ "slug": "3-season", "name": "My new trip", "itemIds": [1, 2, 3] }
```

Validation (400 on failure):
- `name` non-empty string
- `slug` resolves to a known template
- `itemIds` non-empty array of numbers

Behavior (single `db.transaction`):
1. Resolve template by slug. Pull selected `template_items` (id IN itemIds AND
   in this template) joined to their `template_categories`, ordered by category
   position then item position.
2. New list id = `max(id) + 1`. Insert into `lists` with `name`, blank
   description/external_id, position 0.
3. For each distinct template category in iteration order:
   - Insert a new `categories` row on the new list, preserving template's
     category position.
4. For each selected template item:
   - Find an `items` row by case-insensitive name match
     (`LOWER(name) = LOWER(?)`). If none, INSERT a new item with weight=0,
     author_unit='oz', description copied from the template item, other fields
     blank. Cache name → id within the request to avoid double-insert.
   - INSERT into `category_items` with qty=1, worn=0, consumable=0, star=0,
     position = per-category counter, priority = template item's priority.
5. Return `{ id, name }` of the new list.

### `GET /api/lists/:id`

Add `priority` (string|null) to each category item in the response. Pull from
`category_items.priority` in the existing query.

## Frontend

### Routing

- New dep: `react-router-dom`.
- `App.tsx` becomes the router shell + topbar (always visible). Routes:
  - `/` → `<TripHome>` (current logic — fetch lists, list switcher, TripView)
  - `/templates` → `<TemplatesList>`
  - `/templates/:slug` → `<TemplateDetail>`
  - `/new-trip/:slug` → `<NewTripFromTemplate>`
- Topbar gets a "Templates" link.
- `TripHome` honors `?list=<id>` query param for default selection.

### Components (new files in `src/`)

- `TripHome.tsx` — extracted current landing logic.
- `TemplatesList.tsx` — fetch `/api/templates`, render rows with category and
  item counts. Counts come from a small extension to the templates list
  endpoint (or from a quick fetch of each template detail) — chose: just fetch
  `/api/templates/:slug` per row on mount? No — extend the index endpoint to
  include counts via a single SQL query. **Decision: extend the GET
  `/api/templates` response** with `categoryCount`/`itemCount` to avoid N+1.
- `TemplateDetail.tsx` — fetch `/api/templates/:slug`, render categories with
  items grouped by priority order Critical → Contingent → Suggested → Optional
  → Unnecessary. Each item has name, priority pill, description, example.
  "New trip from this template" button → `/new-trip/:slug`.
- `NewTripFromTemplate.tsx` — fetch template, controlled state for name and
  per-item-id checked map. Defaults: Critical & Contingent checked, Suggested
  & Optional unchecked. Unnecessary hidden behind a toggle (still default
  unchecked when shown). Header counter: "X items selected across Y
  categories". Submit POSTs and navigates to `/?list=<newId>`.

### TripView changes

- Render small priority pill next to item name when `priority` present.
- Don't touch weight math.

### Types & API

- `Priority` union and optional `priority?: Priority | null` on `CategoryItem`.
- `api.createFromTemplate({ slug, name, itemIds })`.

## Verification

1. `npm run import` and `npm run import:template` succeed cleanly (idempotent
   migration must not break anything).
2. `npm run dev`, no TS or console errors.
3. `agent-browser` walkthrough:
   - `/templates` → click `3-Season Backpacking` → screenshot
     `template-detail.png`.
   - "New trip from template" → name "Template test trip", uncheck a Contingent
     item, check a Suggested item → screenshot `template-new-trip.png` →
     submit.
   - Land on new trip view → screenshot `template-created-trip.png`. Verify
     priority pills and selected items present.
   - Switch list and back; persists.
4. `sqlite3` checks confirm row counts and `priority IS NOT NULL` count > 0.
5. Cleanup test trip, close browser.

## Open questions & resolutions

- **Counts on the templates index endpoint** — the spec doesn't say. Resolution:
  add `categoryCount`/`itemCount` to `GET /api/templates`. Avoids N+1 from the
  catalog screen and is purely additive.
- **`itemIds` validation** — also filter to items that actually belong to the
  resolved template, in case a stale/cross-template id is sent. Silently drop
  unknowns; only error if the resulting set is empty.
- **List `position`** — current rows have varied positions; the UI sorts by
  `id DESC`. Set new list `position=0` since position is unused for sort.
- **Item description on creation** — the prompt says "description copied from
  the template item's description". Use `template_items.description`, not
  example or more_info.

## Results

### Files modified

- `server/db.ts` — added idempotent `ALTER TABLE category_items ADD COLUMN priority TEXT` after `PRAGMA table_info` check.
- `server/index.ts` — added `categoryCount`/`itemCount` to `GET /api/templates`; added `POST /api/lists/from-template`; included `priority` in `GET /api/lists/:id` items query.
- `src/types.ts` — added `Priority` union and `TemplateSummary` / `TemplateItem`; added optional `priority` on `CategoryItem`.
- `src/api.ts` — added `templates()` and `createFromTemplate()`; introduced shared `post<T>` helper.
- `src/App.tsx` — replaced single-page shell with `BrowserRouter` + topbar nav; routes for `/`, `/templates`, `/templates/:slug`, `/new-trip/:slug`.
- `src/TripView.tsx` — render priority pill next to item names when `priority` is non-null.
- `src/styles.css` — new classes for `.page`, `.template-list`, `.template-item`, priority `.pill` colors, picker rows, counter bar, button styles.

### Files created

- `src/TripHome.tsx` — extracted current landing logic; honors `?list=<id>` query param.
- `src/TemplatesList.tsx` — `/templates` catalog screen.
- `src/TemplateDetail.tsx` — `/templates/:slug` screen with priority grouping; exports `priorityClass` helper used by the new-trip form.
- `src/NewTripFromTemplate.tsx` — `/new-trip/:slug` form with priority-based defaults, hide-by-default Unnecessary toggle, live counter, and submit → navigate to `/?list=<id>`.
- `docs/plans/2026-04-10-01-template-feature.md` — this plan.
- `screenshots/template-detail.png`, `screenshots/template-new-trip.png`, `screenshots/template-created-trip.png` — verification artifacts.

### Verification performed

- `npm run import` and `npm run import:template` both clean (265 items / 24 lists / 13 categories / 108 template items) — idempotent migration didn't disturb either.
- `npx tsc --noEmit` clean.
- agent-browser walked the full flow: `/templates` → `3-Season Backpacking` → "New trip from this template" → name "Template test trip" with one Contingent unchecked + one Suggested checked → submit → landed on `/?list=613` showing the new trip with 73 priority pills (Critical / Contingent / Suggested).
- DB confirmed: `lists` row with 73 `category_items` and 73 non-null `priority` rows. Name-match correctly reused existing `items` like "Hiking shirt" (id 24) and created new rows for items not in the library.
- `?list=<id>` query param verified by directly navigating to `/?list=612` (loaded "Utah 7 days 2026") and back to `/?list=613`.
- Test trip cleaned up: `MAX(id)=612`, `priority IS NOT NULL` count back to 0.

### Deviations from plan

- No structural deviations. Added one defensive `try/catch` around `category_items` insert that swallows `UNIQUE` constraint violations, in case a future template has two distinct template items resolving to the same library row in the same category. Couldn't reproduce in current data, but cheaper than crashing the whole transaction.
- The list switcher (`<select>`) moved out of the topbar and into `TripHome`'s subbar so the topbar can stay constant across routes (and own the "Templates" nav link). Not strictly required by the prompt, but the cleanest router refactor.
- During verification I observed that `npm run dev` couldn't bind because a long-running dev server was already up; my edits hot-reloaded into the existing server, so testing went through the existing port 5173/3000 instance.

### Things to flag

- The user appears to have a parallel "Batch A" of editing endpoints (PUT/POST/DELETE for lists/categories/items/category_items) being added to `server/index.ts` and a matching `Item` type plus extended `api.ts` client. My changes are additive and non-overlapping, but the two streams should be sanity-checked together when the user reviews. Specifically: my `POST /api/lists/from-template` lives in the original block above the new edit primitives, and my CategoryItem `priority` field flows through both code paths since both go through the same shape.
- `priorityClass` is exported from `TemplateDetail.tsx` and reused by `NewTripFromTemplate.tsx`. If the user prefers, this could move to a small `priority.ts` helper.
- Worth deciding whether the `/templates` link should be hidden when there are zero templates, or whether the catalog should show a CTA to import.
