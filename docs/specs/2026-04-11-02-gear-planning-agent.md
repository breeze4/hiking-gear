# Gear Planning Agent

Two Claude Code skills for planning and critiquing trips against a condensed body of external planning expertise (Skurka, Clelland, personal preferences).

## Problem

Building a gear list for a new trip — or lightening an existing one — is slow, easy to get wrong, and hard to do consistently. The expertise lives in books and blog posts the user has read but can't keep paged in. The user wants a Claude Code workflow that:

1. Turns raw source material (epubs + personal notes) into a concise, editable guidelines doc.
2. Uses those guidelines plus the user's existing item library to build new trip lists from a prompt.
3. Uses the same guidelines to critique an existing trip and propose a lighter/cleaner version.

The trip view in the app is the right place to read a gear list. The planning *process* is better as an interactive conversation in Claude Code against the app's HTTP API.

## Goals

- A single source of planning expertise on disk (`docs/guidelines/`), authored by a skill and read by another skill. Easy to tweak over time.
- Cold-start: a trip prompt becomes a real, weighable trip list in the app, picked from items the user already owns.
- Critique: an existing trip can be cloned and progressively improved without ever mutating the original.
- Agent writes to the app exclusively through the HTTP API — no direct DB access, no second write path.
- Gaps (items not in the library but called for by the guidelines) are surfaced as placeholders and wishlist hand-offs, not invented with fake weights.

## Non-goals

- Winter planning — user does not do winter trips.
- In-app UI for the agent. The conversation lives in Claude Code; the app is view-only for what the skill produces.
- Automated condition research (weather, trail reports, permits) — tracked as a future agent, not in this spec.
- Persistent "already critiqued" state. Dismiss means ending the session.
- Any agent-owned store of decisions outside the DB and the guidelines doc.
- Building a scoring/optimization engine. The skill uses LLM reasoning against prose guidelines; no algorithm.

## Solution

Two skills plus one guidelines directory:

1. **`docs/guidelines/`** — condensed, human-readable planning expertise. Trip-type-layered: a baseline (3-season general) plus `desert/` and `alpine/` override subdirs. One markdown file per category.

2. **`/gear-guidelines` skill** — one-shot-plus-tweak workflow for building and maintaining `docs/guidelines/`. Reads epubs and personal notes, condenses them into the directory structure. Rarely invoked. Never touches the database.

3. **`/gear-plan` skill** — everyday planning tool with two modes:
   - **Cold-start**: user gives a trip prompt. Skill writes an empty trip shell up front, interviews the user category-by-category using the guidelines + the library, fills in the trip as it goes.
   - **Critique**: user points at an existing trip. Skill clones it to a new trip, interviews the user through proposed changes (drop, swap, add), writes changes to the new trip only. The original is never touched.

The 3-season template already in the database supplies the canonical category structure for both modes. The guidelines doc is authored to align with that template; unifying template + guidelines is a future follow-up.

## Workflows

### Cold-start

1. User: `/gear-plan` with a trip prompt (e.g. "3 nights, White Mountains in late June, expecting afternoon thunderstorms, two car-camp nights on either end").
2. Skill infers trip type (desert / alpine / baseline) and confirms with the user.
3. Skill writes the trip parameters into a freeform description and creates a new empty list via `POST /api/lists`. User can open the app and watch the shell appear.
4. Skill loads the 3-season template, the user's item library, and the relevant guidelines subset (baseline + one override dir).
5. Skill walks categories in template order. For each category it proposes items picked from the library, referencing guideline principles for the reasoning. Placeholders (weight 0, flagged) are created for guideline-required items with no library match; gaps are called out in chat.
6. Skill writes categories and `category_items` to the new trip via the existing API as each category is confirmed. The user sees the trip fill in live.
7. At the end, skill summarizes the trip: total/base weight, list of gaps, and any "better pick exists" recommendations the user can later route to the wishlist (handled by a separate, out-of-scope workflow).

### Critique

1. User: `/gear-plan` with an existing trip id or name, plus optional goals ("get base weight under 12 lbs", "focus on the Big 3").
2. Skill clones the trip via `POST /api/lists/:id/clone` with a proposed name (`{original} — critiqued {date}`); user can rename in chat. Skill writes a pointer back to the original into the new trip's description.
3. Skill interviews the user through proposed changes against the cloned trip — one proposal at a time or grouped by category, the skill's choice based on volume. Proposals include drops, swaps to other library items, `qty=0` "leave it off" marks, and gaps that imply a future purchase.
4. Each accepted proposal is written to the clone via the existing API. Rejected proposals are noted and dropped.
5. Dismiss ends the session; the clone is left as-is in whatever state it reached (may be partly modified or untouched). The original trip is never written to.

### Build guidelines

1. User: `/gear-guidelines` with pointers to source material (epub paths, personal notes).
2. Skill walks the raw material with the user, condensing principles and rules into `docs/guidelines/` files. Trip-type-layered structure (see Data Flow).
3. No database interaction. The skill's entire output is markdown on disk.
4. Re-runnable for tweaks — user can invoke again with "update the shelter guidelines based on this new note" and the skill edits the relevant file.

## Data Flow

### Guidelines directory layout

```
docs/guidelines/
  README.md              — cross-cutting principles (base-weight targets, systems thinking)
  shelter.md             — baseline 3-season guidance
  sleep.md
  kitchen.md
  pack.md
  worn.md
  electronics.md
  ...                    — one file per 3-season template category
  desert/
    README.md            — desert-specific principles (water, sun, sand)
    shelter.md           — overrides baseline where needed; omitted if no override
    water.md             — category unique to desert
  alpine/
    README.md            — altitude, exposure, cold nights
    insulation.md
    traction.md
```

The baseline files cover the 3-season template's categories 1-for-1. Override dirs only contain files that actually override or add; missing means "baseline applies as-is."

### Runtime data flow

- **Trip parameters**: freeform prose in `lists.description`. No schema change. Skill writes on creation and reads on critique.
- **Library**: skill reads via `GET /api/items` (or `/api/items/all` for counts with usage). Never invents real-weight items.
- **Template**: skill reads via `GET /api/templates/:slug` to get canonical category structure and priority-tagged item suggestions.
- **Trip detail**: skill reads via `GET /api/lists/:id` for critique mode.
- **Trip writes**: `POST /api/lists` (new), `POST /api/lists/:id/clone` (critique), `POST /api/categories`, `POST /api/category_items`, `PUT /api/category_items/:catId/:itemId` for qty/worn/consumable, `POST /api/items` for new placeholders. All existing except one addition.
- **API addition**: `POST /api/lists` to create a blank list with name + description. Small handler in `server/index.ts`. This is the skill's minimum viable shell-creation path.

### Gaps and placeholders

- A guideline-required item with no library match becomes a new `items` row with weight 0, name set from the guideline, and (optionally) a description noting it's a placeholder. Linked into the new trip's `category_items` like any other item.
- The skill lists all placeholders in a closing summary so the user can replace them with real gear as it's acquired.
- Wishlist hand-off is out of scope for this spec — a placeholder plus a chat note is enough.

## Behavior

### Cold-start

- **Shell first, fill in progressively**: the empty list is created immediately so the app can show it forming. Each confirmed category is written before moving to the next.
- **Trip type inferred, confirmed**: skill proposes desert/alpine/baseline from the prompt text and asks the user to confirm. Only one override dir is loaded per session (no "alpine + desert" crossover).
- **Library-first picks**: every picked item comes from `items` unless flagged as a placeholder. No invented real-weight entries.
- **Reasoning surfaced**: each pick references a guideline principle in chat ("Shelter: picking your Xmid Pro — guidelines call for a double-wall or bathtub-floor shelter given afternoon storms").
- **Better-pick callouts**: when the library has a working match *and* the skill would recommend a different item (not yet owned), it says so in chat and lets the user forward the suggestion to the wishlist. No automatic wishlist writes from this skill.

### Critique

- **Clone first, then edit**: the skill clones before it proposes anything. The clone is the workspace.
- **Original is immutable**: no code path in the skill writes to the source trip id. This is a property the skill must preserve, not enforced by schema.
- **Proposal granularity**: skill picks grouping based on volume. For ≤5 proposals it walks them one at a time. For more, it groups by category and walks categories. Hard rule: no "apply all" without per-proposal confirmation.
- **Proposal types**:
  - Drop (delete the `category_items` row).
  - Leave off (`qty=0`, reuses the existing singleton/leave-it-off state).
  - Swap (delete one row, add another).
  - Add (new row, possibly with a placeholder item for gaps).
- **Dismiss**: user says "stop"; skill halts and leaves the clone in its current partially-modified state. The user can delete the clone manually via the app.

### Build guidelines

- **One file at a time**: skill writes one markdown file per interaction cycle, so the user can review each file before moving on.
- **Overrides stay overrides**: if content applies to all trip types, it goes in the baseline file; the skill should resist the urge to copy-paste content into override dirs.
- **Tweakability**: the skill re-reads and diffs existing files before overwriting. Small edits are patches, not rewrites.

## Resolved Decisions

- **One spec covers both skills.** They share the guidelines doc as their interface and it's easier to reason about them together. Plans can split them later if needed.
- **API-only writes.** No direct better-sqlite3 access from the skills. If an endpoint is missing, add it. This keeps the API honest as a second consumer and avoids a second write path that can drift.
- **Trip parameters live in `lists.description` as freeform prose.** No schema change. Trades queryability against zero migration cost and matches single-user, few-trips reality.
- **Categories come from the 3-season template**, not from the guidelines. The template is the canonical category taxonomy today; guidelines are authored to match. Unification is a follow-up.
- **Immutable critique.** Critique mode *always* clones first. The original is never written to. This is a behavioral guarantee of the skill, enforced by reading the skill's prompt carefully and never passing the original's id into a write call.
- **Pointer back to the source trip** for critiqued clones lives in the new trip's description ("Lightened from trip #42, 2026-04-11"). No `parent_list_id` column.
- **Trip-type-layered guidelines** (baseline + desert + alpine). The season axis is fixed at 3-season (never winter); the trip-type axis is desert vs alpine, with a baseline that covers both where they agree.
- **Gaps become placeholder items** (weight 0, flagged in chat), not invented real-weight entries. Users can replace placeholders with real gear later; wishlist integration is separate.
- **No test framework.** Project norm is typecheck-only; the one API addition is a thin handler not worth a test infra investment.

## Modules

- **`docs/guidelines/`** (content, not code)
  - Role: **defines** the interface consumed by `/gear-plan`. Changes to this directory change the skill's behavior.
  - Structure: baseline files + `desert/` and `alpine/` override subdirs, one markdown file per template category, plus a top-level README for cross-cutting principles.
  - Authored by: `/gear-guidelines` skill, maintained by hand and via repeat `/gear-guidelines` invocations.
  - Initial scope: baseline 3-season files covering every category in `reference/template/3-season.csv`. Desert and alpine override dirs start empty and grow as the user hits real trips that need them.

- **`.claude/skills/gear-guidelines/SKILL.md`**
  - Role: one-shot workflow for building `docs/guidelines/` from raw material (epubs + notes).
  - Interface: user invokes with pointers to sources; skill writes/updates markdown in `docs/guidelines/`.
  - No DB interaction. No API calls. Pure disk I/O.

- **`.claude/skills/gear-plan/SKILL.md`**
  - Role: the everyday planning tool, cold-start and critique modes.
  - Interface: user invokes with a trip prompt (cold-start) or a trip id (critique). Skill reads guidelines + library + template + (optionally) existing trip, writes to the app via HTTP API.
  - **Consumes** three contracts: `docs/guidelines/` (markdown), the HTTP API (JSON), and the 3-season template's category taxonomy. Depends on all three being in place.
  - Mode dispatch happens inside SKILL.md based on whether the user provided a prompt or a trip id.

- **`POST /api/lists`** (new endpoint in `server/index.ts`)
  - Role: create a blank list with name + description.
  - **Defines** a new contract the skill depends on. Needs to exist before `/gear-plan` can ship.
  - Tiny handler — inserts a row with default `position`, returns the new row. No tests; typecheck is sufficient.

**Deep module callout**: `docs/guidelines/` is the one genuinely deep module. A simple, stable interface (markdown files on disk) hides substantial planning expertise. The skills around it are deliberately shallow orchestration. This is the right shape — the complexity lives in the content, not in the code, and the content is editable by the user without touching code.

## Future

- **Conditions research agent** — a sibling future skill that takes trip parameters out of `lists.description`, researches weather, trail reports, water sources, permits, and writes results back into the same description field (or a new structured field, to be decided then). Placeholder only; out of scope for this spec.
- **Unify template + guidelines** — once guidelines are stable, retire the separate 3-season CSV template in favor of a single source of truth that covers both category taxonomy and planning principles.
- **Wishlist integration** — `/gear-plan`'s "better-pick" callouts currently stop at chat. A later change could forward them to the wishlist feature (tracked separately). This spec intentionally doesn't touch that workflow.
- **Per-trip-type library filters** — if the library grows enough, the skill may need hints about which items are desert-appropriate vs alpine-appropriate. Not needed at current library size.

## Judgment Calls

_All decisions resolved during interview — no open items._
