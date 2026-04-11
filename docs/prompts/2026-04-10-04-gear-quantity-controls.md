# Orchestration Prompt: Gear quantity controls & "leave it off" state

## Project context

- Working directory: `/home/breeze/dev/hiking-gear`
- Spec: `docs/specs/2026-04-10-02-gear-quantity-controls.md`
- Research: none — spec was written with direct codebase exploration, judgment calls resolved inline
- Build / type-check: `npx tsc --noEmit` (primary gate — no test suite exists)
- Build (bundle): `npm run build` (vite — runs tsc as side effect)
- Dev boot: `npm run dev` (concurrent server + client; used for agent-browser smoke tests)
- Test: none — verification is typecheck + dev-boot + agent-browser
- Lint: none
- Handoff directory: `docs/handoff/` (create if needed)

Three plans, strictly serial. All AFK. No HITL checkpoints.

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under **Context sources** for that step and inline the relevant sections into the agent's **Context** field.
2. If a previous step completed, read `docs/handoff/step-{N-1}-*.md` and paste what changed into the next agent's **Prior step context** field — agents should trust the handoff over this prompt's description.
3. Use worktree isolation for each agent. Merge back only after the step's gate passes.

## Execution plan

### Step 1 — Singleton flag end-to-end

**Plan**: `docs/plans/2026-04-10-06-singleton-flag-end-to-end.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these before launching):
  - `docs/specs/2026-04-10-02-gear-quantity-controls.md` (sections: Problem, Solution, Behavior → Defaults, Modules)
  - `server/db.ts` lines 85–97 (existing `priority` and `archived` migration blocks — the hard pattern to follow)
  - `server/index.ts` lines 340–475 (`ITEM_FIELDS` map, `rowItem`, `POST/PUT /api/items`, `GET /api/items`, `joinedCategoryItem`, `shapeCategoryItem`)
  - `server/index.ts` lines 500–540 (`GET /api/items/all`, `GET /api/items/:id/usage`)
  - `src/types.ts` (entire file — `Item` and `CategoryItem` types)
  - `src/ItemLibrary.tsx` lines 240–307 (the `ItemEditor` component — soft pattern to follow for checkbox)
- **Read first**: `docs/plans/2026-04-10-06-singleton-flag-end-to-end.md` in full.
- **Context**: *(orchestrator pastes inlined source here before launch)*
- **Owns**: `server/db.ts` (append migration block only), `server/index.ts` (specific functions listed in plan's Owns field — do NOT touch other handlers), `src/types.ts` (add `singleton: boolean` to `Item` and `CategoryItem`), `src/ItemLibrary.tsx` (`ItemEditor` component only), `src/api.ts` (only if existing types block new field).
- **Must not touch**: `src/TripView.tsx`, `src/RowEditModal.tsx` (does not exist yet), `src/AddItemModal.tsx`, `server/import.ts`, `server/import-template.ts`, `src/styles.css`. These belong to later steps or are explicitly out of scope per the plan.
- **MUST follow the pattern in**: `server/db.ts` lines 85–97 — the PRAGMA-check-then-ALTER migration pattern. Your new block is a third instance of the same shape.
- **Follow the pattern in**: `server/index.ts` `ITEM_FIELDS` + `PUT /api/items/:id` loop — shows how a new field threads through the update flow. Your quirk: `singleton` is a boolean, so the coercion in the PUT loop needs a boolean branch (`body[key] ? 1 : 0`), not the string cast the other fields use.
- **Do not** add `singleton` to the `AddItemModal.tsx` inline-create form — the POST body default handles new items. That is explicitly Step 2's territory (the RowEditModal will handle singleton editing for trip-view context).
- **Do not** change the `×` unlink button, row control layout, or anything visible in the trip view — that's Step 3.
- **If unclear, stop** and ask: if the PUT handler loop structure prevents clean boolean coercion, surface the ambiguity rather than duplicating the loop.
- **Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**
- **Handoff**: Write `docs/handoff/step-1-singleton-flag.md` listing:
  - Migration SQL actually executed (paste the ALTER statement).
  - Confirmation of backfill: output of `SELECT COUNT(*), SUM(singleton) FROM items` after migration (both numbers should match).
  - API surface changes: which endpoints now read/write `singleton`, with one-line descriptions.
  - `Item`/`CategoryItem` type change diff.
  - Any deviations from the plan.

**Gate after Step 1**:

```
npx tsc --noEmit
npm run build
```

Then manually boot `npm run dev`, visit `/items`, toggle the checkbox on one item, reload, verify persistence. Fail → stop and report, do not auto-fix.

**Interface gate (must pass before Step 2 launches)**:

- [ ] `src/types.ts` exports `Item` with `singleton: boolean` and `CategoryItem` with `singleton: boolean`
- [ ] `items` table has `singleton INTEGER NOT NULL DEFAULT 1` column (check with `sqlite3 data/hiking-gear.db "PRAGMA table_info(items)"`)
- [ ] A `GET /api/items` response includes `singleton` as a boolean (`curl http://localhost:3000/api/items | jq '.[0].singleton'` → `true` or `false`, not `1`/`0`)
- [ ] A joined `category_items` response from trip-detail also includes `singleton` on each item

If any interface gate fails, Step 2 will compound the problem — stop and fix Step 1.

---

### Step 2 — Row-edit modal replaces inline editing

**Plan**: `docs/plans/2026-04-10-07-row-edit-modal.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these before launching):
  - `docs/handoff/step-1-singleton-flag.md` (API + type changes from Step 1)
  - `docs/specs/2026-04-10-02-gear-quantity-controls.md` (section: Modules → RowEditModal; Resolved Decisions → pencil opens full modal)
  - `src/ItemLibrary.tsx` lines 240–307 (`ItemEditor` — the field layout to copy)
  - `src/AddItemModal.tsx` (entire file — modal shell pattern: backdrop, close behavior, Escape handling)
  - `src/TripView.tsx` lines 100–220 (`patchCategoryItem` and surrounding helpers — the optimistic-update pattern)
  - `src/TripView.tsx` lines 400–620 (`CategorySection`, `SortableItemRow`, `ItemRow` — all props and render paths to be rewritten)
  - `src/api.ts` (verify `patchItem` and `patchCategoryItem` exist — add if missing)
- **Read first**: `docs/plans/2026-04-10-07-row-edit-modal.md` in full.
- **Prior step context**: Step 1 added `singleton: boolean` to the `Item` and `CategoryItem` TypeScript types. The server returns it on all item reads. You MUST include a singleton checkbox in the modal. Trust `docs/handoff/step-1-singleton-flag.md` over this description.
- **Context**: *(orchestrator pastes Step 1 handoff + inlined source here before launch)*
- **Owns**: `src/RowEditModal.tsx` (new file), `src/TripView.tsx` (specific rewrites: delete inline-edit branch in `ItemRow`, delete `editingKey` state, add `editTarget` state + modal mount, add pencil button in `col-actions`, rewrite prop chain through `CategorySection`/`SortableItemRow`/`ItemRow`), `src/api.ts` (only if missing methods).
- **Must not touch**:
  - The old `×` unlink button — **keep it** for Step 2. Step 3 will absorb its function into `[Remove]`.
  - `src/ItemLibrary.tsx` — the existing `ItemEditor` stays as-is. Duplication is acceptable (explicitly allowed by plan).
  - `src/styles.css` — do not add `.excluded` or any dimmed-row CSS; that's Step 3.
  - Any row control layout beyond adding the pencil button — NO `[Set to zero]`, `[Keep it]`, `[Remove]`, `[+]`, `[–]`. The qty column display stays as the plain number it is today. Step 3 owns all of that.
  - `server/` — no API changes. Both endpoints already exist.
- **MUST follow the pattern in**: `src/ItemLibrary.tsx` `ItemEditor` component (~line 240) — the form field layout (label-wrapped inputs, field-row for packed fields, form-actions for buttons). Your modal body is this form plus three category_item fields (`qty`, `worn`, `consumable`) and the new `singleton` checkbox.
- **Follow the pattern in**: `src/AddItemModal.tsx` — the modal shell (backdrop, Escape, click-outside). Match its open/close conventions.
- **Follow the pattern in**: `src/TripView.tsx` `patchCategoryItem` function — the optimistic local-mirror update style. Your `onSaved` callback should merge the patched row into the mirror the same way.
- **Do not** implement Step 3's control cluster. A reviewer will reject a mixed PR. Leave `col-qty` and `col-actions` in their current shape except for adding the pencil button.
- **Do not** delete the `×` unlink button or the `onUnlink` prop chain — Step 3 owns the removal of that button and absorbs its function into `[Remove]`.
- **If unclear, stop** and ask: split-write error handling (what if item PUT succeeds but category_items PUT fails?) — the plan says "surface via existing error banner, no rollback" but if the error banner plumbing isn't obvious, ask rather than guess.
- **Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**
- **Handoff**: Write `docs/handoff/step-2-row-edit-modal.md` listing:
  - `RowEditModal` component props signature.
  - Which fields go to `PUT /api/items/:id` vs `PUT /api/category_items/:categoryId/:itemId` (the split-write map).
  - `TripView.tsx` prop chain changes: what was removed (`editingKey`, `onEdit`, `onLeave`, `onPatchItem`, `InlineText` if fully removed), what was added (`editTarget` state, `onRequestEdit` callback).
  - Current state of `col-actions`: confirmed the `×` button is STILL there (it will be removed in Step 3) and the pencil button is now next to it.
  - Any deviations from the plan.

**Gate after Step 2**:

```
npx tsc --noEmit
npm run build
```

Then agent-browser smoke test (the plan's task list has the script):

- Open a trip
- Click pencil on an item row → modal opens, all fields populated from the row
- Change name + weight + qty + worn, save → row reflects all changes
- Reload → changes persisted
- Click pencil again, change something, Cancel → no changes persisted
- Click on the row body (not the pencil) → nothing happens (confirms inline-edit is gone)
- Screenshot: `screenshots/row-edit-modal-open.png`

Fail → stop and report.

**Interface gate (must pass before Step 3 launches)**:

- [ ] `src/RowEditModal.tsx` exists and is imported from `TripView.tsx`
- [ ] `ItemRow` in `TripView.tsx` has a pencil button in `col-actions` that calls `onRequestEdit` (or equivalent)
- [ ] The old click-to-inline-edit behavior is GONE — clicking a row body does nothing
- [ ] The old `×` unlink button in `col-actions` is STILL THERE (Step 3 will remove it)
- [ ] Modal writes split correctly: edits to name go to `/api/items/:id`, edits to qty go to `/api/category_items/:catId/:itemId`

---

### Step 3 — Singleton-aware row controls + leave-it-off state

**Plan**: `docs/plans/2026-04-10-08-row-controls-leave-off.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these before launching):
  - `docs/handoff/step-1-singleton-flag.md` (for `singleton` field plumbing)
  - `docs/handoff/step-2-row-edit-modal.md` (for current `ItemRow` prop shape and pencil placement)
  - `docs/specs/2026-04-10-02-gear-quantity-controls.md` (section: Behavior → Row controls by state — this table IS the spec for this step)
  - `src/TripView.tsx` lines 100–220 (`patchCategoryItem` + existing unlink helper — the underlying primitives your new callbacks wrap)
  - `src/TripView.tsx` current `ItemRow` render (post-Step-2) — `col-qty` and `col-actions` are what you're rewriting
  - `src/styles.css` — search for `.item-row` rules to match styling conventions
- **Read first**: `docs/plans/2026-04-10-08-row-controls-leave-off.md` in full.
- **Prior step context**: Step 1 added `singleton: boolean`. Step 2 added a pencil icon in `col-actions` next to the existing `×` unlink button, and removed click-to-inline-edit. Trust both handoffs over this description. The pencil button stays; the `×` unlink button goes away in this step (absorbed into `[Remove]`).
- **Context**: *(orchestrator pastes Step 1 + Step 2 handoffs + inlined source here before launch)*
- **Owns**: `src/TripView.tsx` — `ItemRow` function only (`col-qty` and `col-actions` cell content, `.excluded` class application); any new callback props threaded through `CategorySection` → `SortableItemRow` → `ItemRow`. `src/styles.css` — new `.item-row.excluded` rule and any new row-action button styles. **Nothing else.**
- **Must not touch**:
  - `src/RowEditModal.tsx` — owned by Step 2. Don't modify the modal. Your pencil button continues to open it unchanged.
  - `server/` — no API changes. Every action uses existing endpoints (`PUT /api/category_items/:catId/:itemId` for qty writes, `DELETE /api/category_items/:catId/:itemId` for remove).
  - `src/types.ts` — `singleton` is already there from Step 1.
  - `src/AddItemModal.tsx` — untouched.
  - `src/ItemLibrary.tsx` — untouched.
  - The totals calculation in `TripView.tsx` (lines ~261–275) — it already excludes `qty=0` rows by construction (`Σ qty` and `weight × qty`). Verify visually; do NOT "fix" it.
  - The `patchCategoryItem` helper — reuse it, don't rewrite.
- **Follow the pattern in**: `src/TripView.tsx` existing `patchCategoryItem` — your action callbacks (`onSetZero`, `onKeepIt`, `onRemove`, `onIncQty`, `onDecQty`) are thin wrappers that delegate to it or to the existing unlink helper.
- **Follow the pattern in**: `src/TripView.tsx` existing `col-actions` button markup (post-Step-2 pencil + the soon-to-be-removed `×`) for `stopPropagation` and `row-action` className conventions.
- **Follow the pattern in**: `src/styles.css` existing `.item-row` rules — match the conventions for the new `.excluded` modifier.
- **None — first of its kind** for the state→control composition logic. Use the state→control table in the plan as your spec. Keep logic inline in `ItemRow` unless it grows unwieldy; extraction to a `RowControls` subcomponent is optional and acceptable.
- **Do not** add any new API endpoints. Every action maps to an existing PUT or DELETE.
- **Do not** change the modal or its trigger. Pencil opens modal; that stays.
- **If unclear, stop** and ask: label-vs-icon choice for buttons (spec gives literal labels `[Set to zero]`, `[Keep it]`, `[Remove]` OR suggests icon-with-tooltip alternative `⊘`/`↺`/`🗑`). Pick one and be consistent; if you can't decide, ask. Don't mix.
- **Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.** (This is the last step — "later" means "a future PR".)
- **Handoff**: Write `docs/handoff/step-3-row-controls.md` listing:
  - The button label/icon choice you made.
  - The state→control mapping as implemented (which buttons render in which state).
  - Confirmation that the `×` unlink button is GONE and `[Remove]` replaces it at `qty=0`.
  - Confirmation that Items count and all weight totals correctly exclude `qty=0` rows with no code changes to the totals functions.
  - Agent-browser smoke test results per the plan's task list.
  - Any deviations from the plan.

**Gate after Step 3**:

```
npx tsc --noEmit
npm run build
```

Then agent-browser smoke test covering EVERY state in the spec's row controls table:

- Singleton item at qty=1: shows only `[Set to zero]` + pencil
- Click set-to-zero → row dims, shows `[Keep it]` + `[Remove]` + pencil
- Click Keep it → row re-includes at qty=1
- Set to zero again → click Remove → row deleted
- Multi item: click `+` → qty increments, totals grow
- Multi item at qty=2: click `–` → qty=1
- Multi item at qty=1: `–` disabled
- Singleton overridden to qty=3 (via pencil modal): shows qty number + `+`/`–` + Set-to-zero + pencil
- Leave a row at qty=0, reload page → still dimmed (persistence)
- Confirm Total weight matches sum of included items only, Items count matches `Σ qty` excluding zeros
- Screenshots: `screenshots/row-controls-included.png`, `row-controls-dimmed.png`, `row-controls-multi.png`

Fail → stop and report.

---

## HITL checkpoints

None. All three steps are AFK. The spec is fully resolved (zero open judgment calls). User reviews the final output after Step 3.

## Completion criteria

- All three plan acceptance-criteria checklists completed
- `npx tsc --noEmit` and `npm run build` pass after every step
- Agent-browser smoke test from Step 3's gate demonstrates every row-control state
- Screenshots captured per plan verification sections
- All three `docs/handoff/step-N-*.md` files written
- No deviation from plan scope boundaries (Step 2 must leave the `×` button alone; Step 3 must leave the modal alone)

## Notes for the executor

- **No test framework**: the primary gates are `tsc --noEmit` and `vite build`. Runtime verification is `npm run dev` + agent-browser. Save screenshots to `screenshots/` per the project's CLAUDE.md.
- **Dev server usage**: `npm run dev` runs both server and client concurrently. The server is at port 3000 (verify via `server/index.ts`), client at Vite's default 5173. Agent-browser should point at the Vite URL.
- **Worktree merge order**: strict serial. Do not merge Step 2 until Step 1's interface gate passes. Do not merge Step 3 until Step 2's interface gate passes.
- **Scope discipline is critical**: Steps 2 and 3 both touch `TripView.tsx` `ItemRow`. The split is clean only if each step respects the other's territory. Step 2 touches the edit modal wiring and adds a pencil; Step 3 touches the qty/actions cells and removes the `×`. A reviewer will reject a PR that mixes these.
