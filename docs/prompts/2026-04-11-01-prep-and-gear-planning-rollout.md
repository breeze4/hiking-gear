# Orchestration Prompt: Prep-for-trip + Gear-planning-agent rollout

Executes all 9 open plans in `docs/plans/` (dated 2026-04-11) across two parallel feature tracks.

## Unresolved Judgment Calls

> **DO NOT proceed past this section until all items are resolved.**

None outstanding. The plans themselves already resolve their internal judgment calls (aggregate-check placement in plan 11, position semantics in plan 14, proposal grouping in plan 17). If a plan's "Implementation notes" raise a question you can't answer from the code, stop and ask the user before guessing.

## Project context

- Working directory: `/home/breeze/dev/hiking-gear`
- Specs: `docs/specs/2026-04-11-01-prep-for-trip.md`, `docs/specs/2026-04-11-02-gear-planning-agent.md`
- Research: none
- Build: `npm run build`
- Typecheck (primary gate): `npx tsc --noEmit`
- Test: `npm test` (bootstrapped in Step 1; before Step 1 this script does not exist — skip it on the Stage 1 gate for 09's worktree only)
- Lint: none
- Deploy: `./deploy/deploy.sh` (only after a stage gate is clean and the work is worth deploying — don't deploy after every step)
- Handoff directory: `docs/handoff/` (already exists; append step files here)

All deploys land at `http://beebaby:8002/`. Per project working rule, deploy after each stage that visibly ships user-facing behavior (Stages 1, 2, 3, 4). Skill-only stages (5 and 6) do not need a deploy.

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under "Context sources" and include relevant sections in the agent's **Context** field. Don't make the agent re-read files you've already read.
2. If prior steps completed, read `docs/handoff/step-{N}-<slug>.md` for each relevant prior step and paste the "what changed" findings into the agent's **Prior step context** field.
3. Launch parallel steps in a single message with multiple Agent tool calls, each with `isolation: "worktree"`. Serial steps run one at a time in the main working copy.
4. After a parallel stage, merge the worktrees in the declared order, resolve any conflicts, then run the stage gate before the next stage launches.

## Dependency graph

```
Stage 1 (parallel)      Stage 2 (parallel)       Stage 3        Stage 4        Stage 5 (HITL)   Stage 6
┌──────────────┐        ┌──────────────┐       ┌──────┐       ┌──────┐       ┌──────┐         ┌──────┐
│ 09 prep-fdn  │───┬───▶│ 11 progress  │──┬──▶ │  10  │──────▶│  13  │       │  16  │────────▶│  17  │
│ 15 gdln-skill│───┤    │ 12 row-edit  │──┤    │ dflt │       │ tobuy│       │ base │         │ plan │
└──────────────┘   │    │ 14 blanklst  │──┘    └──────┘       └──────┘       └──────┘         └──────┘
                   └────────────────────────────────────────────────────────────▲─ ─ ─ ─ ─ ─ ─ ─ ─┘
                                                                   14 also feeds 17 ─────────────┘
```

- Plans 09 and 15 are fully disjoint (server+src vs `.claude/skills/`) — safe to parallelize.
- Plans 11, 12, 14 are disjoint in Stage 2: 14 is backend-only (one handler), 11 is `src/lib/progress*` + `src/TripView.tsx` + `src/styles.css`, 12 is `src/RowEditModal.tsx` + `src/api.ts`. No file overlap.
- Plan 10 is serialized because it re-enters `server/db.ts`, `server/index.ts`, and `server/import.ts` — too much overlap with 09's prior work to risk a conflict.
- Plan 13 is serialized after 10 per its own "soft-sequenced after" clause; without 10's backfill it would work but show noisy data.
- Plan 16 is HITL — the user drives the session. Pause before starting.

## Execution plan

### Stage 1 — Foundation (parallel, 2 worktrees)

#### Step 1 — Prep status foundation

**Plan**: `docs/plans/2026-04-11-01-prep-status-foundation.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these): the plan file; `server/db.ts` lines 85–104 (idempotent PRAGMA-check pattern); `server/index.ts` `PUT /api/category_items/:categoryId/:itemId` handler around line 493; `src/TripView.tsx` existing Worn/Cons column rendering and `onPatchCi` wiring; `src/api.ts` `patchCategoryItem` helper.
- **Read first**: the plan file end-to-end, including "Implementation notes".
- **Context**: (orchestrator pastes the relevant code snippets above before launch)
- **Owns**: `server/db.ts`, `server/index.ts` (only the list-detail GET handler + the two PUT handlers mentioned in the plan), `src/lib/prep.ts` (new), `src/lib/prep.test.ts` (new), `package.json` (add test script), `src/types.ts`, `src/TripView.tsx`, `src/api.ts`, `src/styles.css`
- **Must not touch**: `server/import.ts`, `server/import-template.ts`, the clone-trip section of `server/index.ts`, `src/RowEditModal.tsx`, anything under `src/lib/progress*`, anything under `/to-buy`.
- **MUST follow the pattern in**: `server/db.ts` idempotent migration blocks; `server/index.ts` PUT handlers' `sets: string[]` / `args: unknown[]` conditional-field pattern; `src/api.ts` `patchCategoryItem` shape for the new `patchItem` helper.
- **Do not**: backfill existing rows (Step 6 owns that), change clone defaults (Step 6 owns that), add progress counters or row condensation (Step 4 owns that), add a weighed checkbox to the row-edit modal (Step 5 owns that).
- **Stay within scope**: if you see an improvement that belongs to a later step, leave it.
- **Handoff**: Write `docs/handoff/step-1-prep-foundation.md` listing: exact `resolvePrepStatus` signature and return shape, exact new `CategoryItem` fields, which schema columns were added, and the final `npm test` script line.

**Worktree**: yes.

#### Step 2 — `/gear-guidelines` skill scaffolding

**Plan**: `docs/plans/2026-04-11-07-gear-guidelines-skill.md`

**Agent briefing**:
- **Context sources**: the plan file; `docs/specs/2026-04-11-02-gear-planning-agent.md` sections "Workflows → Build guidelines", "Data Flow → Guidelines directory layout", "Modules → `.claude/skills/gear-guidelines/SKILL.md`"; `reference/template/3-season.csv` for the category list; `~/.claude/skills/grill-me/SKILL.md` for frontmatter/body format reference.
- **Read first**: the plan file.
- **Owns**: `.claude/skills/gear-guidelines/SKILL.md` (new), `.claude/skills/gear-guidelines/` directory (new). Nothing else.
- **Must not touch**: `docs/guidelines/**` (Step 8 owns content authoring), `.claude/skills/gear-plan/**` (Step 9), `reference/template/3-season.csv` (read-only), any code.
- **MUST follow the pattern in**: `~/.claude/skills/grill-me/SKILL.md` YAML frontmatter + numbered-steps body style. Directory name must match `name` frontmatter field.
- **Do not**: author real baseline content as part of a smoke test — Step 8 owns the baseline. If any `docs/guidelines/` file is accidentally created during smoke testing, delete it before committing.
- **Handoff**: Write `docs/handoff/step-2-gear-guidelines-skill.md` noting the skill's exact `description` frontmatter line (Step 9's sibling skill must stylistically match) and the list of 3-season category filenames the skill will produce.

**Worktree**: yes.

**Stage 1 gate** (after both worktrees merge, in order Step 1 then Step 2):
- `npx tsc --noEmit` → clean
- `npm test` → resolver tests pass (only meaningful once Step 1 is merged)
- `npm run build` → clean
- Deploy: `./deploy/deploy.sh`
- Interface check: `src/lib/prep.ts` exports `resolvePrepStatus` with the shape declared in plan 09's "Defines interfaces" section. `CategoryItem` in `src/types.ts` has `acquired`, `weighed`, `packed`, and `effective`. Schema has `items.{acquired,weighed}` and `category_items.{acquired,weighed,packed}`. **Stop and report if any are missing — Stages 2–4 all depend on them.**

---

### Stage 2 — Prep fan-out (parallel, 3 worktrees)

Launch all three in one message. File sets are disjoint; they can land in any merge order.

#### Step 3 — `POST /api/lists` endpoint

**Plan**: `docs/plans/2026-04-11-06-create-blank-list-endpoint.md`

**Agent briefing**:
- **Context sources**: the plan file; `server/index.ts` `app.put('/api/lists/:id', ...)` handler (~line 294) for the response shape; any existing `INSERT INTO lists` site for position semantics; the `readJson` / `badRequest` helpers.
- **Prior step context**: Step 1 already modified `server/index.ts` (list-detail GET + category_items PUT + items PUT). Trust `docs/handoff/step-1-prep-foundation.md`. Your handler is additive — place it next to `app.put('/api/lists/:id', ...)` and do not touch Step 1's edits.
- **Owns**: one new handler in `server/index.ts`. Nothing else.
- **Must not touch**: `server/db.ts`, `server/import.ts`, `src/**`.
- **MUST follow the pattern in**: `server/index.ts` `app.put('/api/lists/:id', ...)` — validate → insert → re-select → return. Match position semantics used by `from-template` / `clone`.
- **Handoff**: Write `docs/handoff/step-3-blank-list-endpoint.md` recording the exact request/response JSON shape (Step 9's gear-plan skill will parse it verbatim).

**Worktree**: yes.

#### Step 4 — Prep progress counters + row condensation

**Plan**: `docs/plans/2026-04-11-03-prep-progress-and-condensation.md`

**Agent briefing**:
- **Context sources**: the plan file; `docs/handoff/step-1-prep-foundation.md` (for `resolvePrepStatus` exact shape and `CategoryItem.effective`); `src/TripView.tsx` `categoryTotals` function (~line 43) as the sibling pattern; Step 1's newly-added PrepCell code in `src/TripView.tsx`.
- **Prior step context**: Step 1 added three prep columns (Acq / Wgh / Pkd) to the trip view. You are layering counters and a condensed-row variant on top. `resolvePrepStatus` is already imported and wired to row rendering — reuse it.
- **Owns**: `src/lib/progress.ts` (new), `src/lib/progress.test.ts` (new), `src/TripView.tsx` (counters in headers + conditional row layout), `src/styles.css` (condensed-row styling).
- **Must not touch**: `src/lib/prep.ts` (consume only), server code, `src/RowEditModal.tsx`, `/to-buy` anything, the existing `.item-row.excluded` CSS class.
- **MUST follow the pattern in**: `src/lib/prep.ts` and `src/lib/prep.test.ts` — same pure-function discipline and test harness; `src/TripView.tsx` `categoryTotals` reducer style.
- **Do not**: add `acquired`/`packed` editing to `RowEditModal` (Step 5 owns weighed only — nothing else moves to the modal). Don't introduce progress to `/to-buy` (Step 7).
- **If unclear, stop**: if the `package.json` `test` script needs to be widened to include `progress.test.ts` and you can't tell how Step 1 wrote it, check the handoff file or ask.
- **Handoff**: Write `docs/handoff/step-4-prep-progress.md` noting the `TripPrepProgress` exports and where counters render in `src/TripView.tsx`.

**Worktree**: yes.

#### Step 5 — Row edit modal weight ↔ weighed coupling

**Plan**: `docs/plans/2026-04-11-04-row-edit-weight-weighed-coupling.md`

**Agent briefing**:
- **Context sources**: the plan file; `docs/handoff/step-1-prep-foundation.md` (for `patchItem` signature and resolver `writeTarget` shape); `src/RowEditModal.tsx` existing split-write pattern (how `singleton` vs `qty`/`worn`/`consumable` dispatch to different endpoints).
- **Prior step context**: Step 1 created `src/api.ts` `patchItem(itemId, patch)` and `resolvePrepStatus` — reuse both. The resolver's `writeTarget.weighed` tells you which endpoint to target.
- **Owns**: `src/RowEditModal.tsx` entirely; `src/api.ts` — only to verify `patchItem` accepts `weight`/`weighed` (extend fields if needed, do not rewrite the helper).
- **Must not touch**: `src/lib/prep.ts`, `src/TripView.tsx`, `src/lib/progress.*`, server code, schema.
- **Follow the pattern in**: `src/RowEditModal.tsx`'s existing library-vs-trip field split; `src/TripView.tsx` PrepCell click-to-toggle write dispatch (created in Step 1) for the resolver call site.
- **Do not**: add acquired or packed checkboxes to the modal. Do not add reverse coupling (clearing weight ≠ auto-uncheck).
- **Handoff**: Write `docs/handoff/step-5-row-edit-weighed.md` noting the manual-override latch implementation and how save dispatches weighed to item vs category_item.

**Worktree**: yes.

**Stage 2 gate** (merge Step 3, Step 4, Step 5 in any order, then):
- `npx tsc --noEmit` → clean
- `npm test` → all resolver + progress tests pass
- `npm run build` → clean
- Smoke test in browser at `http://localhost:5173`: counters render, condensed row works, modal weighed checkbox auto-flips, blank list POST returns JSON via curl.
- Deploy: `./deploy/deploy.sh`
- Interface check: `POST /api/lists` response matches plan 14's declared shape (Step 9 depends on it).

---

### Stage 3 — Prep defaults + backfill (serial)

#### Step 6 — Defaults at entry points

**Plan**: `docs/plans/2026-04-11-02-prep-defaults-at-entry-points.md`

**Agent briefing**:
- **Context sources**: the plan file; `server/import.ts` item + category_items insert sites; `server/index.ts` `POST /api/lists/from-template` handler and the clone-trip handler (~lines 620–650); `server/db.ts` existing idempotent migration pattern plus Step 1's additions.
- **Prior step context**: Step 1 added schema columns with default 0. Existing lighterpack-imported rows are therefore stale. Your backfill block in `server/db.ts` is the one-shot fix, gated on `settings.prep_backfill_done`. Step 3 added a blank-list POST handler — do not touch it.
- **Owns**: `server/import.ts`, `server/index.ts` (from-template handler + clone-trip handler only), `server/db.ts` (new backfill block only, appended), `src/lib/prep.test.ts` (extend with clone-reset tests, or add a new sqlite-backed test file).
- **Must not touch**: `src/lib/prep.ts`, `src/TripView.tsx`, `src/lib/progress.*`, `src/RowEditModal.tsx`, `src/api.ts`, anything `/to-buy`, Step 3's POST /api/lists handler.
- **MUST follow the pattern in**: `server/db.ts` migration-block style; existing `server/index.ts` clone-trip transaction structure.
- **Handoff**: Write `docs/handoff/step-6-prep-defaults.md` noting the backfill settings key, the clone INSERT's new column handling, and any test additions.

**Gate**: `npx tsc --noEmit && npm test && npm run build`. Deploy: `./deploy/deploy.sh`. Verify the backfill actually ran on beebaby by checking a known lighterpack-imported row's `acquired` field.

---

### Stage 4 — `/to-buy` screen (serial)

#### Step 7 — To-buy aggregated shopping list

**Plan**: `docs/plans/2026-04-11-05-to-buy-screen.md`

**Agent briefing**:
- **Context sources**: the plan file; `docs/handoff/step-1-prep-foundation.md` (resolver shape, CategoryItem fields); `docs/handoff/step-6-prep-defaults.md` (backfill status — confirms existing rows are marked acquired); `server/index.ts` `GET /api/items/all` handler (~line 517) for SQL shape; the clone-trip or from-template transaction for the bulk-update pattern; `src/ItemLibrary.tsx` as the sibling list view; `src/App.tsx` existing route registration.
- **Prior step context**: Schema, resolver, and defaults are all in place. You're adding a new aggregation surface that reads through them.
- **Owns**: `server/index.ts` (add two new endpoints only), `server/prep-aggregator.ts` (new), `server/prep-aggregator.test.ts` (new), `src/ToBuyScreen.tsx` (new), `src/App.tsx` (route + nav link), `src/api.ts` (new `fetchToBuy`/`acquireFromToBuy` helpers), `src/styles.css`.
- **Must not touch**: `src/lib/prep.ts`, `src/lib/progress.ts`, `src/TripView.tsx`, `src/RowEditModal.tsx`, `server/import.ts`, `server/import-template.ts`, the clone-trip handler.
- **MUST follow the pattern in**: `src/lib/prep.test.ts` for the node:test harness; `src/ItemLibrary.tsx` for the list-view layout; `src/App.tsx` for route registration.
- **Implementation note**: the plan prescribes extracting `runMigrations(db)` from `server/db.ts` so the aggregator tests can use a temp sqlite file. Do the refactor — it's small and pays off.
- **Do not**: show trip references on rows (explicitly excluded). Do not add a wishlist / dismiss action.
- **Handoff**: Write `docs/handoff/step-7-to-buy.md` noting the two new endpoints, the aggregator function signature, and whether `runMigrations` was extracted.

**Gate**: `npx tsc --noEmit && npm test && npm run build`. Smoke test in browser: `/to-buy` route loads, unacquired items appear, "Mark acquired" flips state and the row disappears, navigating to a trip view reflects the new state. Deploy: `./deploy/deploy.sh`.

---

### Stage 5 — HITL: author baseline guidelines content

> **STOP. Pause for the user.**

#### Step 8 — Author baseline guidelines (HITL)

**Plan**: `docs/plans/2026-04-11-08-author-baseline-guidelines.md`

This plan is inherently human-in-the-loop. An agent cannot drive it end-to-end: it requires source material (Skurka/Clelland epubs, personal notes) only the user has, and each category condensation needs user review before moving on.

**Orchestrator action**: do not launch an agent here. Instead:
1. Stop and tell the user: "Stage 4 complete. The next plan (`docs/plans/2026-04-11-08-author-baseline-guidelines.md`) is HITL. Invoke `/gear-guidelines` in a fresh Claude Code session with your source material staged, walk through each 3-season category, and commit the results. Return here (or start a new session with this prompt + the `docs/plans/INDEX.md` updated) to run Step 9."
2. Do not proceed to Step 9 until the user confirms `docs/guidelines/` is populated and `docs/plans/INDEX.md` shows plan 16 completed.

**Gate**: user confirmation + `git status` shows `docs/guidelines/README.md` plus one file per 3-season template category. Do not deploy (no server changes).

---

### Stage 6 — `/gear-plan` skill (serial)

#### Step 9 — Gear-plan cold-start + critique skill

**Plan**: `docs/plans/2026-04-11-09-gear-plan-skill.md`

**Agent briefing**:
- **Context sources**: the plan file; `docs/specs/2026-04-11-02-gear-planning-agent.md` sections "Workflows → Cold-start", "Workflows → Critique", "Behavior", "Data Flow → Runtime data flow"; `.claude/skills/gear-guidelines/SKILL.md` (from Step 2) for sibling style; `docs/handoff/step-3-blank-list-endpoint.md` for the exact `POST /api/lists` contract; `server/index.ts` handler signatures for every endpoint listed in plan 17's "Defines interfaces" section.
- **Prior step context**: `POST /api/lists` is live (Step 3). `docs/guidelines/` is populated (Step 8). The sibling `/gear-guidelines` skill exists — match its format.
- **Owns**: `.claude/skills/gear-plan/SKILL.md` (new), `.claude/skills/gear-plan/` directory (new). Optionally sibling `.md` files under the same directory if the skill grows unwieldy.
- **Must not touch**: `.claude/skills/gear-guidelines/**`, `docs/guidelines/**` (read-only), `server/**`, `src/**`, `reference/template/3-season.csv`, the database, `docs/specs/**`, `docs/plans/**` (except INDEX.md).
- **MUST follow the pattern in**: `.claude/skills/gear-guidelines/SKILL.md` frontmatter + numbered-procedure body style.
- **Hard invariant**: the skill body must state the immutable-original guarantee explicitly and mechanically — after critique-mode clone, no API call targets `sourceId`.
- **Do not**: invent any new backend endpoint. If the skill seems to need one, stop and file it as a follow-up — the spec says `POST /api/lists` is the only addition needed.
- **Handoff**: Write `docs/handoff/step-9-gear-plan-skill.md` summarizing the skill's mode dispatch, the exact list of endpoints it invokes, and any deviations from the plan.

**Gate**: `npx tsc --noEmit` clean (trivial), `git status` shows only the new skill file(s). Smoke test per the plan: one cold-start invocation and one critique invocation against the dev DB, clean up test data after. No deploy.

---

## Interface gates

- [ ] **After Step 1**: verify `src/lib/prep.ts` exports `resolvePrepStatus` with the exact signature in plan 09's "Defines interfaces" section. Verify `CategoryItem` in `src/types.ts` has `acquired`, `weighed`, `packed`, `effective`. Verify schema columns. Stages 2–4 all depend on these.
- [ ] **After Step 3**: verify `POST /api/lists` returns `{ id, name, description, externalId, position }`. Step 9 parses this.

## HITL checkpoints

- [ ] **Before Step 8**: pause. User drives `/gear-guidelines` in a fresh session against real source material. Do not attempt to automate.
- [ ] **After Step 8**: user confirms `docs/guidelines/` is populated and plan 16 is marked completed in `docs/plans/INDEX.md` before Step 9 launches.

## Completion criteria

- All 9 plan acceptance criteria met.
- `npx tsc --noEmit && npm test && npm run build` clean after every stage.
- Every plan's checklist in `docs/plans/INDEX.md` moved from Not Started to Completed.
- All stages 1–4 deployed to beebaby and smoke-tested in a browser.
- Frontend smoke test coverage: prep columns click-to-toggle, progress counters render, condensed row collapses/expands, row-edit modal weighed auto-flip, `/to-buy` aggregation + acquire, blank-list POST visible in list switcher.
- Skills smoke-tested: `/gear-guidelines` produces one file end-to-end; `/gear-plan` runs cold-start and critique once each, test data cleaned up.
