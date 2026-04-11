# /gear-plan skill (cold-start + critique)

## Parent spec

`docs/specs/2026-04-11-02-gear-planning-agent.md`

## What to build

A new Claude Code project-local skill at `.claude/skills/gear-plan/SKILL.md` implementing the two everyday planning workflows: **cold-start** (trip prompt → new list with picked items) and **critique** (existing trip → cloned trip with proposed changes). A single SKILL.md dispatches between modes based on whether the user provides a trip prompt or a trip id. Both modes read the guidelines from `docs/guidelines/`, the 3-season template from the API, and the user's item library from the API; both modes write to the app exclusively through the HTTP API.

This is the final slice of the gear-planning-agent spec. After this plan merges, the full workflow is live: build guidelines → plan trips against them.

## Type

AFK

The *skill authoring* is AFK — the skill file can be written from the spec without human interaction. The skill's *use* is of course HITL, but that's orthogonal to delivering this plan.

## Blocked by

- Blocked by `2026-04-11-06-create-blank-list-endpoint.md` — cold-start mode calls `POST /api/lists`, which doesn't exist until that plan merges.
- Blocked by `2026-04-11-08-author-baseline-guidelines.md` — the skill is end-to-end-verifiable only when there's real guidelines content to reason against. The skill *file* can be drafted earlier, but the acceptance test (run it on a real trip prompt and verify sensible output) requires authored baselines.

## User stories addressed

From `docs/specs/2026-04-11-02-gear-planning-agent.md`:

- Cold-start workflow — full sequence (prompt → trip type confirmation → shell creation → category walk → placeholder handling → closing summary).
- Critique workflow — full sequence (trip id → clone → proposal walk → per-proposal accept/reject → immutable-original guarantee → dismiss handling).
- Goals: "Cold-start: a trip prompt becomes a real, weighable trip list." "Critique: an existing trip can be cloned and progressively improved without ever mutating the original." "Agent writes to the app exclusively through the HTTP API."

## Acceptance criteria

- [ ] `.claude/skills/gear-plan/SKILL.md` exists with valid YAML frontmatter (`name: gear-plan`, `description: ...`).
- [ ] The description specifies both modes and the trigger conditions, so the harness will invoke the skill on prompts like "plan a gear list for ...", "critique my gear list for trip N", "lighten up trip N", etc.
- [ ] The skill body documents mode dispatch: if the user gives a trip prompt (freeform description), enter cold-start mode; if the user gives a trip id or name referring to an existing trip, enter critique mode. Ambiguous invocations prompt the user to clarify before proceeding.
- [ ] **Cold-start mode** is fully documented as a numbered procedure:
  1. Parse the trip prompt, infer trip type (baseline / desert / alpine), **confirm with the user**.
  2. Write trip parameters to a freeform description string. Create the empty trip shell via `POST /api/lists` with the chosen name and description. Capture the returned list id.
  3. Load `docs/guidelines/README.md` plus baseline `docs/guidelines/<category>.md` files, plus the override subdir files if applicable. Load the 3-season template via `GET /api/templates/<slug>` for category order. Load the user's item library via `GET /api/items` (or `/api/items/all`).
  4. Walk the template's categories in order. For each category: propose items picked from the library, justify each pick with a guideline reference, flag gaps as placeholders (weight 0, new `items` row), pause for user confirmation, then write the category and its `category_items` via `POST /api/categories` and `POST /api/category_items`.
  5. Closing summary: total/base weight, placeholder list, better-pick callouts.
- [ ] **Critique mode** is fully documented as a numbered procedure:
  1. Parse the trip reference (id or name), look up via `GET /api/lists` then `GET /api/lists/:id`. Confirm with the user.
  2. Clone the trip via `POST /api/lists/:id/clone` with a proposed name like `{original name} — critiqued {YYYY-MM-DD}`. Capture the new list id.
  3. Update the clone's description via `PUT /api/lists/:id` to include a pointer back to the source: `"Lightened from trip #<id>, <YYYY-MM-DD>"`. Preserve the original description content too.
  4. Load guidelines + library + the cloned trip's current state.
  5. Walk proposals. Grouping rule: if total proposals ≤5, walk one at a time; if more, group by category and walk category-by-category. Hard rule: no "apply all" without per-proposal confirmation.
  6. For each accepted proposal, write via existing endpoints (`DELETE /api/category_items/:catId/:itemId` for drops, `PUT /api/category_items/:catId/:itemId` with `qty:0` for leave-off, delete+add for swaps, `POST /api/items` + `POST /api/category_items` for adds). Writes go to the **clone id only**.
  7. "Stop" / "dismiss" halts the interview and leaves the clone in its current partial state.
- [ ] The skill body states an **immutable-original guarantee**: in critique mode, no API call references the source trip's id after the clone completes. The skill should treat this as a hard invariant.
- [ ] The skill body lists every API endpoint it uses by path + method, and cross-references which mode uses which endpoint. Acts as a reviewable contract between the skill and the backend.
- [ ] The skill body documents the gap/placeholder behavior: when no library item matches a guideline requirement, create a new item via `POST /api/items` with `weight: 0`, a name from the guideline, and a description noting it's a placeholder. Never invent a non-zero weight.
- [ ] The skill body documents the better-pick callout behavior: when a library match exists but a better option (not yet owned) would be recommended, surface it in chat only — do not write anywhere. Wishlist handoff is out of scope.
- [ ] Smoke test cold-start end-to-end: invoke `/gear-plan` with a trivial trip prompt, confirm a new trip shell appears in the app, confirm at least one category is populated with library items, confirm the skill produces a closing summary. Leave the test trip in place or delete via the app — don't leave half-populated test data in the prod-shaped DB.
- [ ] Smoke test critique end-to-end: invoke `/gear-plan` against an existing trip, confirm a clone is created with a `critiqued` suffix in the name, confirm proposals are walked, confirm the original trip is byte-for-byte unchanged (`GET /api/lists/:original-id` before and after).
- [ ] `npx tsc --noEmit` clean (no code changed).
- [ ] `git status` shows only the new skill file(s). No unrelated edits.
- [ ] Commit. No deploy needed.
- [ ] Update `docs/plans/INDEX.md` — move this plan from Not Started to Completed.

## Owns

- `.claude/skills/gear-plan/SKILL.md` — **new file**. The entire skill definition. Both modes documented in one file with clear mode-dispatch logic at the top.
- `.claude/skills/gear-plan/` — **new directory**.
- If the file grows unwieldy, additional sibling reference files (e.g. `.claude/skills/gear-plan/cold-start.md`, `.claude/skills/gear-plan/critique.md`) are allowed, referenced from SKILL.md. Prefer one file if it's readable.

## Must not touch

- `.claude/skills/gear-guidelines/**` — owned by plan `2026-04-11-07`.
- `docs/guidelines/**` — owned by plan `2026-04-11-08`. The skill *reads* from here but does not write.
- `server/**` — no backend changes in this slice. If the skill needs a new endpoint, that's a scope violation — file a follow-up instead. `POST /api/lists` is already added by plan `2026-04-11-06`; no other additions should be needed per the spec.
- `src/**` — no frontend changes in this slice.
- `reference/template/3-season.csv` — read-only.
- `data/hiking-gear.db` — never accessed directly. All DB interaction goes through the HTTP API.
- `docs/specs/**`, `docs/plans/**` — no edits except the INDEX update above.

## Defines interfaces

None. This plan only *consumes* existing interfaces:

- **`docs/guidelines/`** content (shape defined by plan `2026-04-11-07`, content authored by plan `2026-04-11-08`).
- **HTTP API** endpoints: all existing except `POST /api/lists` (defined by plan `2026-04-11-06`). Full list consumed by this plan:
  - `GET /api/settings`
  - `GET /api/lists`, `GET /api/lists/:id`
  - `POST /api/lists` (new from plan `-06`)
  - `PUT /api/lists/:id`
  - `POST /api/lists/:id/clone`
  - `GET /api/templates`, `GET /api/templates/:slug`
  - `GET /api/items`, `GET /api/items/all`
  - `POST /api/items`
  - `POST /api/categories`
  - `POST /api/category_items`, `PUT /api/category_items/:catId/:itemId`, `DELETE /api/category_items/:catId/:itemId`
- **3-season template category taxonomy** (existing data in the DB from the template import).

## Pattern exemplar

- **Follow the pattern in**: `.claude/skills/gear-guidelines/SKILL.md` — the sibling skill written in plan `2026-04-11-07`. Match its YAML frontmatter shape, its "numbered workflow steps" body style, its scope-boundary statements. The two skills should feel like siblings stylistically.
- **Follow the pattern in**: `~/.claude/skills/grill-me/SKILL.md` — user-global skill for frontmatter + numbered-steps format, if the sibling isn't available yet.
- **API reference source**: `server/index.ts` — the skill's documentation of endpoint URLs, request/response shapes, and error behavior must match what's in `server/index.ts`. Read the handler for each endpoint the skill uses, then document it. Don't paraphrase; match.

## Tasks

- [ ] Read the parent spec sections "Workflows → Cold-start", "Workflows → Critique", "Behavior → Cold-start", "Behavior → Critique", "Data Flow → Runtime data flow", and "Modules → `.claude/skills/gear-plan/SKILL.md`" end-to-end.
- [ ] Read `.claude/skills/gear-guidelines/SKILL.md` (from plan `2026-04-11-07`) for sibling style.
- [ ] Read `server/index.ts` and enumerate the exact URL, method, request body, and response shape for every endpoint in the "Defines interfaces" section above. Make a short table to paste into the SKILL.md API reference section.
- [ ] Read `reference/template/3-season.csv` and the `template_categories` / `template_items` tables' structure (via the `GET /api/templates/:slug` response shape) so the skill's cold-start walk references accurate category names.
- [ ] Create `.claude/skills/gear-plan/` and write `SKILL.md` with frontmatter + mode dispatch + cold-start procedure + critique procedure + API reference + scope boundaries + the immutable-original guarantee.
- [ ] Smoke test cold-start: invoke `/gear-plan` with a short prompt like "2 nights, White Mountains, late June, afternoon storms." Confirm an empty trip shell is created, at least one category populates, closing summary runs. Clean up test data.
- [ ] Smoke test critique: pick an existing trip in the dev DB, invoke `/gear-plan` against it. Confirm a clone is created with the suffix, confirm original is unchanged (`GET /api/lists/:original-id` before and after — diff should be empty). Accept or reject a couple of proposals to exercise the path. Clean up test data.
- [ ] `npx tsc --noEmit`. Confirm `git status` shows only the new skill file(s).
- [ ] Commit. No deploy.
- [ ] Update `docs/plans/INDEX.md` — move this plan from Not Started to Completed.

## Implementation notes

- **Frontmatter description field** — this is the skill trigger. Example: "Plan a new trip or critique an existing one against `docs/guidelines/` and the user's item library. Cold-start mode builds a new gear list from a trip prompt; critique mode clones an existing trip and proposes lightening changes without touching the original. Use when the user says 'plan a trip', 'build a gear list', 'critique trip N', 'lighten up my gear list', or similar." Trigger words matter.
- **Mode dispatch goes first.** The very top of the skill body (after any preamble) should be a section titled "Decide the mode" that reads: "If the user's invocation describes a new trip (location, dates, conditions), enter cold-start. If the user's invocation references an existing trip by id or name, enter critique. If ambiguous, ask the user."
- **Immutable-original guarantee** — state it explicitly and mechanically: "Critique mode: after the clone step completes, you have two list ids — `sourceId` (original) and `cloneId` (working copy). Every subsequent API call must target `cloneId`. Do not pass `sourceId` into any write endpoint. If you catch yourself considering a write to `sourceId`, stop and re-read this section."
- **Trip type inference** — the skill reads the prompt text and proposes desert / alpine / baseline. Heuristics: "Mojave/Joshua Tree/Grand Canyon/Utah canyon → desert. Sierras/Cascades/Rockies with alpine terms (pass, peak, altitude) → alpine. Everything else → baseline." The skill asks the user to confirm, always; don't proceed on inference alone.
- **Only one override dir per session.** Cold-start never loads both desert and alpine overrides — trips are one or the other. If the user's prompt spans both, the skill asks them to pick.
- **Placeholder item creation** — use `POST /api/items` with body `{ name, description: "Placeholder — no weight yet", weight: 0, authorUnit: ... }`. The author unit should match a sensible default (`oz` or `g` depending on existing user setting; read from `GET /api/settings`). Mark the placeholder in chat so the user knows to replace it.
- **Better-pick callouts** — when the skill would recommend a better-not-yet-owned item, it says so in chat with the candidate name and reasoning, then asks the user what to do. Options: (a) add placeholder anyway, (b) skip and note, (c) bail out and handle via the wishlist workflow elsewhere. The skill does **not** write to any wishlist table — that feature is handled in a separate session.
- **Proposal grouping threshold** — the "≤5 individual, >5 by category" rule is a default; the skill can fall back to asking the user's preference if unsure. Don't hardcode a specific number that the user can't override.
- **Closing summary format** — a concise markdown block in the chat: total weight, base weight, consumables, worn, items count, list of placeholders with category, list of better-pick callouts. The user reads this to decide if the trip is ready to open in the app.
- **API call etiquette** — the skill should batch when possible (don't re-fetch the library per category; fetch once at the start of a session). Explicitly document the caching rule so future edits don't regress it.
- **Error handling** — if an API call fails mid-category, the skill stops, reports the error, and does not retry silently. Partial writes are acceptable (the trip is left in a half-built state) because they're visible in the app and user can resume the session.
- **Test-trip cleanup** — the smoke tests create real rows in the dev DB. After smoke testing, delete the test trips via the app's delete flow (or `DELETE /api/lists/:id`) so the dev DB stays clean. Do not commit with test trips still present.
- **No tests.** Project norm is typecheck-only. The skill is markdown and there's nothing to unit-test.
