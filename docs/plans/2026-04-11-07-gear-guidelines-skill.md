# /gear-guidelines skill scaffolding

## Parent spec

`docs/specs/2026-04-11-02-gear-planning-agent.md`

## What to build

A new Claude Code project-local skill at `.claude/skills/gear-guidelines/SKILL.md` that defines the workflow for condensing external planning expertise (Skurka/Clelland epubs + personal notes) into `docs/guidelines/`. This slice creates the *skill file* only — it's the means by which the next plan (authoring the baseline content) will be executed. The skill is invokable via `/gear-guidelines` once this plan merges.

The skill's job is to walk the user through condensing source material into the layered guidelines directory structure (baseline + `desert/` + `alpine/` subdirs, one markdown file per 3-season template category). The skill reads source pointers the user provides, interviews the user about what to include/exclude, and writes markdown files one at a time. It never touches the database; it never calls HTTP endpoints.

## Type

AFK

## Blocked by

None — can start immediately in parallel with plan `2026-04-11-06-create-blank-list-endpoint.md`.

## User stories addressed

From `docs/specs/2026-04-11-02-gear-planning-agent.md`:

- "Build guidelines" workflow — the skill that implements it.
- The spec's explicit "Feature: Build guidelines doc" work item.

## Acceptance criteria

- [ ] `.claude/skills/gear-guidelines/SKILL.md` exists with valid YAML frontmatter (`name: gear-guidelines`, `description: ...`).
- [ ] The description is specific enough that the harness will trigger the skill when the user types `/gear-guidelines` or mentions "build/update gear planning guidelines."
- [ ] The skill body documents the directory layout (`docs/guidelines/` baseline + `desert/` + `alpine/`, one markdown file per 3-season template category) so future invocations know where to write.
- [ ] The skill body describes the workflow: (1) ask the user for source pointers (epub paths, note files), (2) confirm the category list from `reference/template/3-season.csv`, (3) walk one category at a time, (4) condense source material into a single markdown file per category, (5) stop and review with the user before moving to the next category.
- [ ] The skill body explicitly states: never read or write `data/hiking-gear.db`, never call HTTP endpoints, never run the dev server. Disk I/O in `docs/guidelines/` only, plus reading source material wherever the user points.
- [ ] The skill documents how overrides work: content that applies to all trip types goes in baseline files; only content that genuinely differs goes in `desert/` or `alpine/` override subdirs. The skill should resist copy-pasting content into override dirs.
- [ ] The skill documents the re-invocation / tweak flow: on subsequent runs, it reads the existing file first, proposes a diff, and applies small edits as patches rather than rewrites.
- [ ] The skill documents what *not* to do: don't invent principles the sources don't support, don't include per-item picks (those live in the library), don't reference the user's specific gear (the guidelines are trip-type-agnostic).
- [ ] The skill can be invoked in a test session on a tiny sample (e.g. a short markdown file the user pastes in as a stand-in for a source) and produces a single guideline file. This verifies the workflow works before plan `2026-04-11-08` uses it on the real epubs.
- [ ] `git status` shows only the new skill file (and any intentional changes). No accidental edits elsewhere.
- [ ] `npx tsc --noEmit` clean (this slice touches no code, so typecheck should pass trivially — running it is still the gate).
- [ ] Commit. No deploy needed (skills are dev-machine-local, not part of the server build).

## Owns

- `.claude/skills/gear-guidelines/SKILL.md` — **new file**. The entire skill definition lives in this one file. If the skill needs helper references later (e.g. a template prompt), add them as sibling files in `.claude/skills/gear-guidelines/` and reference them from SKILL.md — but v1 should fit in one file.
- `.claude/skills/gear-guidelines/` — **new directory**.

## Must not touch

- `docs/guidelines/**` — owned by plan `2026-04-11-08-author-baseline-guidelines.md`. This plan scaffolds the skill; the next plan uses it to produce content.
- `.claude/skills/gear-plan/**` — owned by plan `2026-04-11-09-gear-plan-skill.md`.
- `server/**`, `src/**` — no code changes in this slice.
- `reference/template/3-season.csv` — read-only reference. The skill reads it to know category names; nothing in this plan edits it.
- Any existing `.claude/` content (worktree state, scheduled tasks lock) — don't reorganize the `.claude/` dir.

## Defines interfaces

- **`/gear-guidelines` skill** in `.claude/skills/gear-guidelines/SKILL.md` — consumed by plan `2026-04-11-08-author-baseline-guidelines.md` (which runs the skill). The skill's workflow steps are the interface; downstream plans rely on the skill producing files under `docs/guidelines/` with the structure described in the spec.
- **`docs/guidelines/` directory structure (baseline + `desert/` + `alpine/`, one file per 3-season category)** — defined by this skill's SKILL.md as the canonical layout. Plan `2026-04-11-09-gear-plan-skill.md` reads from this layout and must agree on its shape. The shape is documented in both this skill's SKILL.md and the parent spec.

## Pattern exemplar

- **Follow the pattern in**: `~/.claude/skills/grill-me/SKILL.md` — user-global skill the implementer can read for the YAML frontmatter shape (`name:`, `description:`) and the "numbered steps + clear section headings" body style. Don't copy its content; match its *format*. If the implementer can't access it, the pattern is: `---` frontmatter block with exactly `name` (matches directory name) and `description` (a sentence starting with the skill's purpose and mentioning trigger words), followed by a markdown body with numbered workflow steps.
- None in-repo — this is the first project-local skill. The directory `.claude/skills/gear-guidelines/` must be created as part of this plan.

## Tasks

- [ ] Read `reference/template/3-season.csv` to enumerate the 3-season template's category names. These are the canonical category files the skill will produce (one `.md` per category under `docs/guidelines/`).
- [ ] Read the parent spec (`docs/specs/2026-04-11-02-gear-planning-agent.md`) sections "Workflows → Build guidelines", "Data Flow → Guidelines directory layout", and "Modules → `.claude/skills/gear-guidelines/SKILL.md`" for the full workflow description.
- [ ] Read `~/.claude/skills/grill-me/SKILL.md` for format reference (frontmatter + body). If not accessible, follow the spec-described format.
- [ ] Create `.claude/skills/gear-guidelines/` directory and write `SKILL.md` with YAML frontmatter and a body that covers: directory layout, workflow steps, override rules, re-invocation flow, scope boundaries.
- [ ] Smoke test the skill by invoking `/gear-guidelines` in a fresh Claude Code session on a trivial sample (e.g. a paragraph of text pasted in as a stand-in source). Confirm the skill (a) asks for sources, (b) confirms categories, (c) writes one file, (d) stops for review. Revert any test files created in `docs/guidelines/` unless they're genuinely useful — the next plan is the one that produces real content.
- [ ] `npx tsc --noEmit` — trivial pass since no code changed, but the gate runs.
- [ ] Commit. No deploy.
- [ ] Update `docs/plans/INDEX.md` — move this plan from Not Started to Completed.

## Implementation notes

- **Frontmatter description field** — this is what the harness matches against user prompts to decide whether to invoke the skill. Make it specific: "Build or update `docs/guidelines/` by condensing external gear-planning sources (Skurka, Clelland, personal notes) into trip-type-layered markdown files. Use when the user mentions building or updating gear planning guidelines." Trigger words matter more than prose.
- **Workflow steps should be numbered** — Claude Code skills execute step-by-step when invoked. Each numbered step is a concrete action the skill takes. Don't write the skill as free-form essay; write it as a sequenced procedure with decision points.
- **Scope statements are load-bearing** — the skill explicitly saying "never touch the database" prevents drift when the next plan's author is running the skill and feels tempted to integrate it with the live trip data. The separation is real and should be stated.
- **Override discipline** — the skill body should include a heuristic like: "Ask: does this principle apply to all 3-season trips, or only desert/alpine? If 'all,' write it in the baseline file. If only one trip type, write it in the override. If you're copy-pasting paragraphs across files, stop — the principle is probably baseline." Specific, enforceable.
- **One file at a time, with review** — the workflow should pause after each file is written and show the user the diff. The user approves or asks for edits before moving to the next category. This matches the spec's "one file at a time" behavior rule.
- **No content authored in this plan** — resist the temptation to use the skill to author the real baseline content as part of the smoke test. That's plan `2026-04-11-08`, and it's HITL (the user drives it). Delete any accidental content from the smoke test before committing.
