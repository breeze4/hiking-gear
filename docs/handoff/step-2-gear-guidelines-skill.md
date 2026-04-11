# Step 2 handoff: gear-guidelines skill

## Frontmatter `description:` line (verbatim)

```
description: Build or update docs/guidelines/ by condensing external gear-planning sources (Skurka, Clelland, personal notes) into trip-type-layered markdown files. Use when the user mentions building or updating gear planning guidelines, condensing gear-planning source material, or editing docs/guidelines/.
```

Step 9's `/gear-plan` skill should match this style: a single sentence stating the purpose, followed by trigger-word phrases introduced with "Use when...".

## Baseline category filenames declared by the skill

Derived from `reference/template/3-season.csv`:

- `worn.md` — GO SUIT CLOTHING + ITEMS WORN
- `footwear.md` — FOOTWEAR
- `element-protection.md` — CLOTHING: ELEMENT PROTECTION
- `stop-and-sleep.md` — CLOTHING: STOP & SLEEP
- `pack.md` — PACKING
- `shelter.md` — SHELTER
- `sleep.md` — SLEEP
- `kitchen.md` — KITCHEN
- `hydration.md` — HYDRATION
- `navigation.md` — NAVIGATION
- `tools-first-aid.md` — TOOLS, FIRST AID, EMERGENCY, & UTILITY
- `personal.md` — PERSONAL ITEMS
- `canyoneering.md` — CANYONEERING (activity-specific; only written if user needs it)

Plus `README.md` at baseline and inside each override subdir (`desert/`, `alpine/`) for cross-cutting principles.

## Deviations from the plan

- **No smoke test performed.** The plan's acceptance criteria include a smoke test invocation, but this step is a pure file-write executed by an orchestrated agent — there is no fresh interactive session to invoke `/gear-guidelines` in. Smoke testing is deferred to step 8 (baseline guideline authoring), which is HITL and will exercise the skill against real source material. No content was written to `docs/guidelines/` from this step.
- **Canyoneering included as a baseline category.** The CSV lists CANYONEERING as a full category with its own item rows. It's activity-specific rather than universal, so the SKILL.md notes it's conditional — only write `canyoneering.md` if the user is actually building canyoneering guidance.
- **Category "GO SUIT CLOTHING + ITEMS WORN" appears twice in the CSV** (the template contains two sub-template blocks). Collapsed to a single `worn.md` since it's the same category taxonomy.
