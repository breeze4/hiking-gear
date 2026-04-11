# Orchestration Prompt: Extract Skurka + Clelland source material for `/gear-guidelines`

Prepares condensed, per-category extracts from three backpacking books so that plan `docs/plans/2026-04-11-08-author-baseline-guidelines.md` (HITL) has pre-digested source material to feed into the `/gear-guidelines` skill instead of re-reading full epubs each session.

This prompt is **AFK-safe**. It spawns parallel research agents that only write to `reference/extracts/` — no code, no database, no skill files, no `docs/guidelines/`.

## Unresolved Judgment Calls

> **DO NOT proceed past this section until all items are resolved.**

None outstanding. If any agent's category genuinely has no relevant content in all three books (rare — maybe CANYONEERING), it should write a short stub file saying so rather than invent material.

## Project context

- Working directory: `/home/breeze/dev/hiking-gear`
- Downstream consumer: `docs/plans/2026-04-11-08-author-baseline-guidelines.md` (the user running `/gear-guidelines` to write `docs/guidelines/`).
- Source material (already extracted to text — do NOT re-OCR or re-parse epubs):
  - `reference/ebooks/text/skurka-ultimate-hikers-gear-guide.txt` — Andrew Skurka, *The Ultimate Hiker's Gear Guide* 2nd ed (2017). ~4.9k lines. Clean XHTML-derived text. Highest-quality source.
  - `reference/ebooks/text/clelland-ultralight-backpackin-tips.txt` — Mike Clelland, *Ultralight Backpackin' Tips* (2011). ~3.1k lines. Clean HTML-derived text. Tip-format prose, often terse and opinionated.
  - `reference/ebooks/text/clelland-ladigin-lighten-up.txt` — Mike Clelland & Don Ladigin, *Lighten Up!* (2014). ~3.9k lines. **OCR'd from image-based epub** — body text is readable but hand-lettered illustration labels come through as gibberish. Use only where the surrounding body text is coherent; skip mangled sections.
- Category source of truth: `reference/template/3-season.csv`. Major sections (uppercase header rows) are:
  - `GO SUIT CLOTHING + ITEMS WORN`
  - `FOOTWEAR`
  - `CLOTHING: ELEMENT PROTECTION`
  - `CLOTHING: STOP & SLEEP`
  - `PACKING`
  - `SHELTER`
  - `SLEEP`
  - `KITCHEN`
  - `HYDRATION`
  - `NAVIGATION`
  - `PERSONAL ITEMS`
  - `CANYONEERING` *(tail section; likely minimal or skipped — not baseline 3-season content)*
- Build / typecheck / test: **not applicable**. This prompt produces markdown only. `git status` at the end must show only new files under `reference/extracts/`.

## Goal

Produce one markdown extract file per major CSV section at `reference/extracts/<section-slug>.md`, plus a cross-cutting `reference/extracts/README.md` with principles that don't belong to a single category (base-weight targets, systems thinking, worn-weight philosophy, etc.).

Each extract file is **raw research**, not finished guidelines. It exists to save the user from re-reading 12k lines of book text when they run `/gear-guidelines` to author `docs/guidelines/<category>.md`.

## What an extract file must contain

For each section, the agent writes `reference/extracts/<section-slug>.md` with:

1. **Header**: section name + the sub-items from the CSV (one line each). This is the scope of the file.
2. **Per-book sections**, in this order — Skurka, then Clelland *Ultralight Tips*, then Clelland/Ladigin *Lighten Up*. Under each:
   - **Direct quotes** of passages that give concrete guidance (gear weight targets, selection criteria, trade-offs, failure modes, technique prerequisites). Quote faithfully. Use blockquote Markdown. Include enough context that the quote is self-standing.
   - **Brief paraphrase** only when a quote would be too long or when the source meanders. Mark paraphrase as such.
   - **Source locator** after each quote: book short-name + approximate chapter or page marker if the text has one (Skurka's XHTML retains chapter structure; Clelland *Tips* uses numbered chapters; *Lighten Up* has `--- page N ---` markers from the OCR script).
3. **Cross-book synthesis** (short — 5–15 bullets): the principles that actually agree across books, flagged disagreements, and anything the agent noticed that the user will want when condensing.
4. **Out-of-scope / noise notes** (optional): things the agent found but decided not to include, and why. Short.

### Quality bar

- **Faithful**, not creative. Do not invent, infer, or extend. If the books don't say it, it's not in the extract.
- **Quote-heavy**. The user will do the condensation in `/gear-guidelines`; the agent's job is to *find* and *group*, not to summarize into a finished product. When in doubt, include the quote.
- **Keep product names**. Skurka and Clelland name specific gear — preserve those mentions in quotes and synthesis. The extracts are raw research; downstream `/gear-guidelines` will decide what to strip for the product-agnostic `docs/guidelines/` files. In the extract, seeing which products the authors actually point to is valuable context.
- **3-season focused**. Skurka's book covers winter and desert; for this pass, only extract passages relevant to 3-season conditions. Note winter/desert-only material in a short "deferred for override dirs" list at the bottom of the file.
- **Length discipline**. Target 200–600 lines per extract file. If an agent hits 1000+ lines, it's copying the book — tighten.
- **No user-specific content**. Zero references to the user's inventory, trips, or preferences. Just source material.

## Output layout

```
reference/extracts/
├── README.md                           # cross-cutting principles
├── go-suit.md                          # from "GO SUIT CLOTHING + ITEMS WORN"
├── footwear.md                         # from "FOOTWEAR"
├── clothing-element-protection.md      # from "CLOTHING: ELEMENT PROTECTION"
├── clothing-stop-and-sleep.md          # from "CLOTHING: STOP & SLEEP"
├── packing.md                          # from "PACKING"
├── shelter.md                          # from "SHELTER"
├── sleep.md                            # from "SLEEP"
├── kitchen.md                          # from "KITCHEN"
├── hydration.md                        # from "HYDRATION"
├── navigation.md                       # from "NAVIGATION"
├── personal-items.md                   # from "PERSONAL ITEMS"
└── canyoneering.md                     # only if non-trivial content exists
```

Filename slug rule: lowercase, ASCII, words joined by `-`, drop colons and punctuation (`CLOTHING: ELEMENT PROTECTION` → `clothing-element-protection.md`).

## Execution plan

### Stage 1 — Per-section extraction (parallel, ~11 agents)

Launch one agent per CSV section in a single message with multiple `Agent` tool calls. Use `subagent_type: "general-purpose"` and `isolation: "worktree"` for each. (Worktree isolation means each agent writes into a disposable copy of the repo; merge them back at the end.)

All agents receive the same boilerplate (below) plus the section-specific scope.

**Agent briefing template** (fill `{{ ... }}` before launch):

> **Goal**: Produce `reference/extracts/{{slug}}.md` — a raw, quote-heavy, per-book research extract for the `{{ SECTION }}` category of a 3-season backpacking gear list. Downstream, a human will use this file (plus two sibling extracts) to hand-author `docs/guidelines/{{slug}}.md`. You are doing the search + excerpt pass, not the condensation.
>
> **Read first** (in full):
> - `reference/extracts/` — verify it exists or create it.
> - `reference/template/3-season.csv` — find the section `{{ SECTION }}` and list its sub-items verbatim for the header of your extract file.
> - `reference/ebooks/text/skurka-ultimate-hikers-gear-guide.txt` — full file. Skurka is the highest-quality source; spend the most time here.
> - `reference/ebooks/text/clelland-ultralight-backpackin-tips.txt` — full file.
> - `reference/ebooks/text/clelland-ladigin-lighten-up.txt` — full file. This one is OCR'd; body text is readable but illustration labels are garbage. Skip mangled lines, don't try to "reconstruct" them.
>
> **Scope**: the CSV sub-items for `{{ SECTION }}`. Anything the books say about those items or the gear system they form. Ignore material about sections you don't own.
>
> **Output file**: `reference/extracts/{{slug}}.md`. Use the structure in the prompt: header + per-book quote collections + cross-book synthesis + out-of-scope notes. Target 200–600 lines.
>
> **Hard rules**:
> - Only write `reference/extracts/{{slug}}.md`. Do not touch any other file. Do not read or write the database, `docs/guidelines/**`, `docs/plans/**`, or any source code.
> - Do not invent content or extend the books. If Skurka says "pack weight under 25 lb for 3-season", that's what you quote — don't round, don't interpret, don't extrapolate.
> - Keep product names when the books mention them. They're useful research context; the downstream `/gear-guidelines` skill decides what to strip for product-agnostic guidelines.
> - 3-season only. Defer winter / desert / alpine material to a short "deferred for override dirs" bullet list at the bottom.
> - Use blockquote Markdown for direct quotes. Include source attribution after each quote (`— Skurka, Ch. 7` or `— Clelland *Tips*, Tip 43` or `— Clelland/Ladigin *Lighten Up*, p. 62`).
> - No user-specific content. Zero references to the user's inventory or trips.
> - Length: if you pass 1000 lines, you're copying the book. Stop and tighten.
>
> **Handoff**: after writing the file, report back with: (a) the file path, (b) the line count, (c) a one-sentence summary of what the file contains, (d) any cross-cutting principles you noticed that belong in `reference/extracts/README.md` rather than in your section file. Do not write `README.md` yourself — that's Stage 2.

**Sections to launch** (11 agents; skip CANYONEERING unless another section's agent flags meaningful canyoneering content in the books — both Skurka and Clelland are primarily 3-season backpacking authors, so coverage is unlikely):

| Slug | CSV section |
|---|---|
| `go-suit` | `GO SUIT CLOTHING + ITEMS WORN` |
| `footwear` | `FOOTWEAR` |
| `clothing-element-protection` | `CLOTHING: ELEMENT PROTECTION` |
| `clothing-stop-and-sleep` | `CLOTHING: STOP & SLEEP` |
| `packing` | `PACKING` |
| `shelter` | `SHELTER` |
| `sleep` | `SLEEP` |
| `kitchen` | `KITCHEN` |
| `hydration` | `HYDRATION` |
| `navigation` | `NAVIGATION` |
| `personal-items` | `PERSONAL ITEMS` |

**Stage 1 gate** (after all agents return, worktrees merged into main working copy):

- `ls reference/extracts/*.md` shows the 11 expected files.
- Spot-check three files at random — each has per-book sections, actual quotes, and synthesis bullets (not just one source or empty per-book sections).
- `git status` shows only new files under `reference/extracts/`.
- No file exceeds ~1000 lines. If one does, trim or split before proceeding.

### Stage 2 — Cross-cutting `README.md` (serial, one agent)

After Stage 1 merges cleanly, launch one agent to write `reference/extracts/README.md`.

**Agent briefing**:

> **Goal**: Write `reference/extracts/README.md` — a short (under 300 lines) collection of cross-cutting principles that apply across multiple gear categories, pulled from all three source books.
>
> **Read first**:
> - All 11 files under `reference/extracts/*.md` that Stage 1 just produced. These contain "cross-cutting principles noticed" notes in each agent's handoff and in the synthesis section — harvest from both.
> - The three source text files at `reference/ebooks/text/*.txt`, for the explicit cross-cutting sections (Skurka's introductory chapters on hiking-vs-camping style, base-weight targets, systems thinking; Clelland *Tips*' Manifesto chapters 1–10; Lighten Up's intro chapters).
>
> **Content to include**:
> - Pack weight targets by skill/trip type (quote Skurka's numbers directly).
> - Base weight vs skin-out weight vs total weight definitions.
> - "Hiking vs camping" framing from Skurka — what each style prioritizes.
> - The Clelland "Manifesto" tips as a compact list (Tips 1–10) — quote, don't paraphrase.
> - Systems thinking: shelter + sleep + clothing as a temperature system, not independent items.
> - "Stupid light" vs genuinely light — the safety floor.
> - Any other principle that shows up in two or more of the category extract files.
>
> **Hard rules**:
> - Only write `reference/extracts/README.md`. Do not modify the Stage 1 files.
> - Same quote-heavy, faithful-to-source discipline as Stage 1.
> - No user-specific content. Product names from the books are fine to preserve in this extract.
> - 3-season only; defer winter/desert/alpine to a bullet list at the bottom.
>
> **Handoff**: report the file path, line count, and a brief summary of sections.

**Stage 2 gate**:

- `reference/extracts/README.md` exists.
- Line count under ~300.
- `git status` shows exactly: the 11 Stage 1 files plus `reference/extracts/README.md`. Nothing else.

---

## Completion criteria

- `reference/extracts/` contains `README.md` plus one `<slug>.md` per major CSV section (11–12 files).
- Each extract file has quotes from at least two of the three source books. (Lighten Up may be thin for some categories due to OCR noise — that's fine, as long as Skurka and Clelland *Tips* are represented.)
- No extract file exceeds ~1000 lines; most sit in the 200–600 range.
- No file under `docs/guidelines/`, no file under `.claude/skills/`, no code edits, no schema changes. `git diff` on `server/`, `src/`, `.claude/`, `docs/` (except nothing in `docs/`) is empty.
- The user can now run `/gear-guidelines` in a fresh session, point it at `reference/extracts/`, and author `docs/guidelines/<category>.md` files without re-reading 12k lines of book text.

## Notes for the orchestrator

- **Don't inline source material into agent briefings.** The text files are large. Each agent reads its own copies directly from disk. The orchestrator only pastes the section name, slug, and the agent briefing template.
- **Don't pre-condense.** Resist the urge to do the condensation work in the orchestration layer. The whole point is that the agents produce raw extracts and the user does the judgment-call condensation in `/gear-guidelines`.
- **Worktree merges are trivial here** — each agent writes a distinct new file, so no conflicts are expected.
- **If an agent's file comes back unusably thin**, it's acceptable to re-run just that one section with a sharper briefing (e.g., pointing at specific chapters of Skurka). Don't re-run the whole batch.
- **Cost awareness**: 11 parallel agents each reading three multi-thousand-line files is not cheap. This is a one-shot pre-computation — the output saves time on every future `/gear-guidelines` invocation, so it's worth it once.
