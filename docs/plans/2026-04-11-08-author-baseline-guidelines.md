# Author baseline guidelines content

## Parent spec

`docs/specs/2026-04-11-02-gear-planning-agent.md`

## What to build

Populate `docs/guidelines/` with the real baseline 3-season planning content by running the `/gear-guidelines` skill against the user's raw source material (Skurka/Clelland epubs and personal notes). This plan's deliverable is **content**, not code. After this plan merges, the `/gear-plan` skill (plan `2026-04-11-09`) has a non-empty knowledge base to reason against.

Scope is the baseline files only — one markdown file per 3-season template category, plus `docs/guidelines/README.md` for cross-cutting principles. Desert and alpine override subdirs are intentionally left empty in this plan; they'll grow organically as the user hits real trips that need them.

## Type

HITL

This plan is inherently human-in-the-loop: it requires the user to provide source material the agent doesn't have access to (copyrighted epubs, personal notes), to make judgment calls about what's in-scope for the user's hiking style, and to review each category's condensation before accepting it. An agent can't drive this end-to-end without the user.

## Blocked by

- Blocked by `2026-04-11-07-gear-guidelines-skill.md` — this plan *uses* the skill that plan creates.

## User stories addressed

From `docs/specs/2026-04-11-02-gear-planning-agent.md`:

- "Build guidelines" workflow (execution phase).
- Goals: "A single source of planning expertise on disk (`docs/guidelines/`), authored by a skill and read by another skill."

## Acceptance criteria

- [ ] `docs/guidelines/README.md` exists and covers cross-cutting principles (base-weight targets, systems thinking, worn-weight philosophy). Length is pragmatic — a page or two of condensed rules, not an essay.
- [ ] `docs/guidelines/<category>.md` exists for every category in `reference/template/3-season.csv`. Verify coverage by listing the CSV's category headers and cross-checking against the filenames written.
- [ ] Each category file contains real condensed content from the sources — not placeholder "TODO" stubs. The user has reviewed each file.
- [ ] Override subdirs exist as empty directories: `docs/guidelines/desert/` and `docs/guidelines/alpine/`. They contain no files in this plan; future trips populate them. (If the harness can't commit empty directories, add a `.gitkeep` in each.)
- [ ] No per-item gear picks in any file. No references to the user's specific gear inventory. The guidelines are trip-type principles, not product recommendations.
- [ ] `/gear-plan` (not yet implemented — plan `2026-04-11-09`) *would* have enough signal to reason about each category. Sanity check: pick one category and mentally ask, "if an agent read this file plus my item library, could it pick items and justify them?" If not, iterate.
- [ ] `npx tsc --noEmit` clean (trivial — no code changed).
- [ ] `git status` shows only new files under `docs/guidelines/`. No unrelated edits.
- [ ] Commit in one pass (or a small series of category-by-category commits if the user prefers reviewable history). No deploy.
- [ ] Update `docs/plans/INDEX.md` — move this plan from Not Started to Completed.

## Owns

- `docs/guidelines/` — **new directory**, populated in this plan.
  - `docs/guidelines/README.md` — new, cross-cutting principles.
  - `docs/guidelines/<category>.md` — new, one per 3-season template category.
  - `docs/guidelines/desert/` — new, empty directory (with `.gitkeep` if required).
  - `docs/guidelines/alpine/` — new, empty directory (with `.gitkeep` if required).

## Must not touch

- `.claude/skills/gear-guidelines/**` — owned by plan `2026-04-11-07`. If the skill needs tweaks during authoring, note them for a follow-up rather than editing in this plan.
- `.claude/skills/gear-plan/**` — owned by plan `2026-04-11-09`.
- `server/**`, `src/**` — no code changes.
- `reference/template/3-season.csv` — read-only. Used to enumerate categories.
- `docs/specs/**`, `docs/plans/**` — no edits except the INDEX update above.

## Defines interfaces

- **`docs/guidelines/` content** — consumed by plan `2026-04-11-09-gear-plan-skill.md`. The *shape* (file-per-category, baseline + override structure) is fixed by the skill from plan `2026-04-11-07`; this plan defines the *content* that the gear-plan skill will read. Changes to the content shape would break the consumer's assumptions — keep the shape stable, edit freely within files.

## Pattern exemplar

- **MUST follow the pattern in**: `.claude/skills/gear-guidelines/SKILL.md` — this plan executes that skill. Invoke `/gear-guidelines` and follow its workflow. Do not hand-author files outside the skill's flow.
- **Category list source**: `reference/template/3-season.csv` — the canonical list of 3-season categories. Every baseline file corresponds to a category there.
- **None** for content style — the condensation style is whatever the user and the skill produce collaboratively. The sources are the user's own epubs/notes; there's no in-repo prior art to match.

## Tasks

- [ ] User: collect and stage the source material (Skurka epub, Clelland epub, personal notes) somewhere readable by Claude Code.
- [ ] User: invoke `/gear-guidelines` in a Claude Code session and provide source pointers.
- [ ] Skill walks the user through the category list from `reference/template/3-season.csv`, confirming scope.
- [ ] For each category: skill drafts a markdown file condensing the sources, user reviews, iterates until satisfied, moves on.
- [ ] Draft `docs/guidelines/README.md` last (once category files are stable, cross-cutting principles are easier to identify).
- [ ] Create empty `docs/guidelines/desert/` and `docs/guidelines/alpine/` directories (with `.gitkeep` if needed).
- [ ] User: spot-check a couple of categories by imagining the `/gear-plan` agent reading them alongside the item library. Is the guidance actionable? If not, tighten.
- [ ] `npx tsc --noEmit`. Confirm `git status` shows only intended files.
- [ ] Commit. (Optionally split commits by category if the user wants reviewable history.)
- [ ] Update `docs/plans/INDEX.md` — move this plan to Completed.

## Implementation notes

- **Desert and alpine start empty on purpose.** The spec says the override dirs "start empty and grow as the user hits real trips that need them." Don't preemptively fill them out — the baseline should cover both trip types well enough that overrides are only written when a real gap is hit.
- **Length discipline.** Guidelines should be scannable, not exhaustive. Aim for a page or two per category. If a file is running long, the user is probably copying source prose instead of condensing it. The skill should enforce this, but the user should push back too.
- **Trip-type agnosticism in the baseline.** Baseline files cover 3-season conditions without assuming desert or alpine. If a principle only applies in one, it belongs in the override dir — not the baseline — even if the override dir is otherwise empty.
- **No gear names.** Baseline files say "shelter under 32 oz for 3-season solo," not "Zpacks Duplex Zip." The item library is where gear names live.
- **Re-runnability.** If the user wants to tweak a file later, they re-invoke `/gear-guidelines` and the skill handles the edit. This plan is "done" when the baseline is authored; future tweaks are maintenance, not part of this plan.
- **Deferred overrides.** Any desert- or alpine-specific content the user notices during authoring goes in a note for themselves (or a scratch `docs/guidelines/OVERRIDE-QUEUE.md` if they want), but no override files are committed in this plan. Keep scope tight.
- **HITL means the user drives the session.** An agent picking up this plan autonomously should stop and ask the user to run the skill. The plan's role is to define the deliverable and acceptance criteria; it is not a script an agent executes alone.
