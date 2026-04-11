# Step 3 handoff — POST /api/lists (blank list endpoint)

Plan: `docs/plans/2026-04-11-06-create-blank-list-endpoint.md`

## What changed

One new handler added to `server/index.ts`, directly after `app.put('/api/lists/:id', ...)`:

```
app.post('/api/lists', async (c) => { ... })
```

No schema changes, no other handler changes, no client changes.

## Request body schema

```jsonc
{
  "name": string,          // required, non-empty after trim
  "description": string    // optional; defaults to ""
}
```

Validation:

- Missing body or non-object body → 400 `{"error":"invalid json"}`.
- `name` missing, non-string, empty string, or whitespace-only → 400 `{"error":"name is required"}`. `name` is trimmed before the empty check, but the trimmed value is what gets stored (leading/trailing whitespace is dropped).
- `description` is accepted as-is when it is a string; any non-string (including `undefined`, `null`) is coerced to `""`.
- Any extra fields on the body are ignored.

## Response body schema (200)

```jsonc
{
  "id": number,          // newly-assigned list id (max(id)+1)
  "name": string,        // trimmed name as stored
  "description": string, // as stored (empty string if omitted)
  "externalId": string,  // always "" for blank lists — see deviation below
  "position": number     // always 0
}
```

This is the same column set returned by `PUT /api/lists/:id`. The gear-plan skill (step 9) can rely on this shape.

Note: `GET /api/lists/:id` (the trip-detail endpoint) returns a superset of these fields plus `archived` and `categories`. Blank lists come back with `archived: false` and `categories: []` from that endpoint, confirming the trip view renders cleanly with zero categories and zero totals.

## Deviations from the plan

1. **`externalId` is `""`, not `null`.** The plan's acceptance criteria say "externalId on a blank list is null", but the `lists.external_id` column is `TEXT NOT NULL DEFAULT ''`. `NULL` would violate the schema. The existing `POST /api/lists/from-template` and `POST /api/lists/:id/clone` handlers both write `''` and that is what `GET /api/lists/:id` returns. This endpoint matches: stores `''`, returns `externalId: ''`. Step 9's skill should treat `externalId: ''` — not `null` — as "no upstream source" when deciding whether a list is lighterpack-imported.
2. **No schema change proposed.** The plan allows `null` but explicitly forbids schema changes in "Must not touch", and the schema forbids `NULL`. Matching the schema is the only coherent option.

## Edge cases observed

- **Whitespace name**: `{"name":"  "}` → 400. `name` is trimmed before the empty check. A name like `"  Test  "` would be stored as `"Test"`.
- **Position**: always `0`, matching `from-template` and `clone`. The app's list-switcher orders by `(position, id)`, and the highest-id list wins the default selection, so new blank lists land as the default trip on reload — consistent with the main spec ("trip view lands on the highest-id list by default").
- **Id assignment**: `COALESCE(MAX(id), 0) + 1`, same pattern as `from-template`. Not auto-increment — this lets existing code that references list ids remain stable and avoids recycled-rowid surprises.
- **No category/item side effects**: a blank list has no `categories`, no `category_items`, no `items`. None of the new prep columns (`items.acquired`, `items.weighed`, `category_items.acquired/weighed/packed` from step 1) need defaulting here.
- **`archived` flag**: not set by the handler; column default (`0`) takes over, so new blank lists are not archived.

## Smoke-test results

Ran against `npm run dev` locally (port 3000) with an empty `data/hiking-gear.db`:

| Request | Result |
|---|---|
| `POST /api/lists {"name":"smoke test","description":"hi"}` | 200 `{"id":1,"name":"smoke test","description":"hi","externalId":"","position":0}` |
| `POST /api/lists {"name":"only name"}` | 200 `{"id":2,"name":"only name","description":"","externalId":"","position":0}` |
| `POST /api/lists {}` | 400 `{"error":"name is required"}` |
| `POST /api/lists {"name":"  "}` | 400 `{"error":"name is required"}` |
| `GET /api/lists` | Array includes both new rows with `archived: false` |
| `GET /api/lists/1` | Returns row plus `categories: []` — confirms empty trip view will render |

`npx tsc --noEmit` clean. `npm run build` clean.
