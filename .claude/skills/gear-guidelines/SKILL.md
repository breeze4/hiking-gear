---
name: gear-guidelines
description: Build or update docs/guidelines/ by condensing external gear-planning sources (Skurka, Clelland, personal notes) into trip-type-layered markdown files. Use when the user mentions building or updating gear planning guidelines, condensing gear-planning source material, or editing docs/guidelines/.
---

This skill condenses external gear-planning expertise into a layered markdown directory at `docs/guidelines/`. It is the authoring tool for a deep module whose interface is markdown on disk. The `/gear-plan` skill (sibling) reads what this skill writes.

## Scope and guard rails

- **Never** read or write `data/hiking-gear.db`. This skill has no business with the database.
- **Never** call HTTP endpoints. Don't hit `/api/...`. Don't start the dev server.
- **Never** run `npm run dev`, `npm run build`, or `./deploy/deploy.sh`. This skill produces docs, not deploys.
- Disk I/O is restricted to:
  - Reading source material wherever the user points (epubs, notes, pasted text, URLs if the user provides them).
  - Reading `reference/template/3-season.csv` to confirm the category taxonomy.
  - Reading existing `docs/guidelines/**` before edits.
  - Writing under `docs/guidelines/**`.
- Do **not** invent principles the sources don't support. If the user has no source material for a category, say so and move on — leave the file unwritten rather than fabricating.
- **Do** include suggested brand/model picks with short rationale when the sources name them. Picks are exemplars, not prescriptions — they show the reader concrete options that illustrate the principle so they know what to shop for. Prefer naming two or three picks at different price/weight points when the sources offer them. Never fabricate a pick; only name gear a source actually endorses.
- Do **not** reference the user's specific gear. Guidelines are trip-type-agnostic and stable; the user's pack rotates. Picks from sources are fine; "the user's current Durston Xmid" is not.
- One file at a time. Pause for review before moving to the next category.

## Directory layout

```
docs/guidelines/
  README.md         — cross-cutting principles (base-weight targets, systems thinking)
  <category>.md     — one file per 3-season template category (baseline)
  desert/           — overrides; only files that actually differ from baseline
    README.md       — desert-specific cross-cutting principles
    <category>.md   — only present where desert genuinely overrides baseline
  alpine/           — overrides; only files that actually differ from baseline
    README.md       — alpine-specific cross-cutting principles
    <category>.md   — only present where alpine genuinely overrides baseline
```

Baseline covers 3-season general. Override subdirs contain only the files that genuinely differ — a missing override file means "baseline applies as-is."

## Baseline category filenames

Derived from `reference/template/3-season.csv`. The skill produces one markdown file per category under baseline:

- `worn.md` — GO SUIT CLOTHING + ITEMS WORN (hiking shirt, pants/shorts, headwear, sunglasses, trekking poles, etc.)
- `footwear.md` — FOOTWEAR (shoes, socks, gaiters, camp footwear)
- `element-protection.md` — CLOTHING: ELEMENT PROTECTION (shell top/bottom, mid-layer, rain, wind, insulated headwear)
- `stop-and-sleep.md` — CLOTHING: STOP & SLEEP (insulated jacket/pants, sleeping tops/bottoms)
- `pack.md` — PACKING (pack, waterproofing, food storage, stuff sacks)
- `shelter.md` — SHELTER (rainfly/tarp, nest, ground cloth, stakes, guylines)
- `sleep.md` — SLEEP (bag/quilt, pad, pillow)
- `kitchen.md` — KITCHEN (stove, pot, fuel, utensil, ignition)
- `hydration.md` — HYDRATION (bottles, treatment)
- `navigation.md` — NAVIGATION (maps, compass, GPS, watch)
- `tools-first-aid.md` — TOOLS, FIRST AID, EMERGENCY, & UTILITY (light, knife, FAK, foot care, sat comm, firestarter, traction, axe)
- `personal.md` — PERSONAL ITEMS (dental, poop kit, hygiene, skin care, wallet)
- `canyoneering.md` — CANYONEERING (rappel device, carabiners, harness, helmet, wetsuit) — activity-specific; only write if user actually needs it

Confirm this list against `reference/template/3-season.csv` at the start of every session — the template may have changed.

## Workflow

Walk these steps in order. Do not skip ahead.

### 1. Ask the user for source pointers

Ask exactly once, up front:
- "What sources are we condensing? Paths to epubs, note files, pasted text, URLs?"
- "Is this a fresh build of `docs/guidelines/`, or a tweak to specific files?"

If the user says "tweak," jump to step 5. Otherwise continue.

### 2. Confirm the category list

Read `reference/template/3-season.csv` and enumerate the category headers (the all-caps rows that aren't item rows). Show the user the baseline filename list derived from those headers. Ask: "Does this category list match what you want covered? Anything to add or drop?"

Do not start writing until the user confirms.

### 3. For each category, one at a time

For the first category the user picks (or the next one in template order):

1. **Read relevant source material.** If the user pointed to an epub, read it with the Read tool. If they pointed to a notes file, read that. If they pasted text, work from the paste. Stay focused on the current category — don't sweep the whole source just to say you did.
2. **Condense into principles and picks.** Extract the rules, tradeoffs, and heuristics for this category, AND surface the specific brand/model picks the sources endorse. A reader should come away knowing both what *kind* of shelter to bring and which specific products the sources point to as examples of that kind. Keep picks tight — a one-line name + short reason is enough; deep specs belong in the item library.
3. **Write a single markdown file** at `docs/guidelines/<category>.md`. Use headers for sub-topics (e.g. under `shelter.md`: "Shelter type", "Site selection", "Stakes and guylines"). Keep it tight — a reader should be able to skim it in under two minutes.
4. **Pause for review.** Show the user the file. Ask: "Look good? Any edits before we move to the next category?"
5. **Apply edits or move on.** Only advance when the user says "move on" or equivalent.

### 4. Override decision at every step

As you're extracting principles, ask yourself (and sometimes the user): "Does this apply to all 3-season trips, or only desert/alpine?"

- **All trips** → write it in the baseline file (`docs/guidelines/<category>.md`).
- **Desert only** → write it in `docs/guidelines/desert/<category>.md`.
- **Alpine only** → write it in `docs/guidelines/alpine/<category>.md`.
- **Unclear** → default to baseline. Override dirs are for genuinely different content.

**Heuristic:** if you're copy-pasting paragraphs across files, stop. The principle is probably baseline. Move it up and delete the duplicates.

If a category has *no* override-worthy content for desert or alpine, do not create empty override files. Skip them. Missing means "baseline applies."

Category-unique content (e.g. a `water.md` under `desert/` that doesn't exist in baseline) is fine — add it as a new file under the override subdir.

### 5. Re-invocation / tweak flow

When the user invokes the skill with "update shelter guidelines based on this new note" or similar:

1. **Read the existing file first.** `docs/guidelines/<category>.md` (or the override version). Don't overwrite blind.
2. **Read the new source material.**
3. **Propose a diff.** Show the user the specific edits you'd make — added paragraphs, tightened wording, corrections. Do *not* rewrite the whole file.
4. **Apply as a patch** using the Edit tool (not Write). Small, surgical changes.
5. **Pause for review** before touching any other file.

If the new source contradicts existing content, flag the contradiction to the user and let them decide which wins. Don't silently overwrite.

## What not to do

- Don't fabricate principles or picks. If the sources are silent on a topic, the guidelines are silent too. If no source names a specific product in a category, don't invent one.
- Don't reference the user's current gear. Guidelines outlive any specific pack — but source-endorsed picks (e.g. "Skurka's long-term pick: Black Diamond Alpine Carbon Cork") are welcome and encouraged.
- Don't batch-write every category in one pass. One file, pause, review, next.
- Don't rewrite a file that already exists — read it first, then patch.
- Don't touch the database, the HTTP API, or the dev server. This skill is pure disk I/O under `docs/guidelines/`.
- Don't write override files that duplicate baseline. If desert shelter advice is the same as baseline shelter advice, there is no desert shelter override.
