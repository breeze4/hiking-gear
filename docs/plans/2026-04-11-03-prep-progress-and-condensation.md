# Prep progress counters and fully-prepped row condensation

## Parent spec

`docs/specs/2026-04-11-01-prep-for-trip.md`

## What to build

Two pieces of user-visible UI polish that sit on top of the prep status foundation:

1. **Progress counters** — each category header shows `N/M prepped`; the trip header shows a trip-wide `N/M prepped` next to the existing weight totals. `N` is the count of rows where all three effective flags are true. `M` is the count of rows with `qty > 0` (excluded rows are not in the denominator).
2. **Fully-prepped row condensation** — when all three effective flags on a row are true, the row fades to ~70% opacity and the three individual prep cells collapse into a single faint aggregate check. Any effective flag flipping back to false snaps the row back to full prominence and restores the three individual cells.

Both pieces live in the trip view and share a single source of truth: a new `TripPrepProgress` pure module in `src/lib/` that exposes two functions — `categoryProgress(category)` and `listProgress(list)` — plus a small helper `isRowFullyPrepped(item, categoryItem)` that the row renderer consults to decide whether to condense.

## Type

AFK

## Blocked by

- Blocked by `2026-04-11-01-prep-status-foundation.md` — needs the schema, resolver, and the three columns in the trip view rendered.

## User stories addressed

- 3 — fully-prepped rows visually recede
- 4 — `4/7 prepped` on category header
- 5 — overall `22/41 prepped` on trip header
- 9 — worn rows still participate (covered because `isRowFullyPrepped` reads `effective.packed` uniformly)
- 16 — excluded rows don't count toward denominators

## Acceptance criteria

- [ ] `npm test` passes with new `TripPrepProgress` tests.
- [ ] `TripPrepProgress.categoryProgress(category)` returns `{ prepped, total }` where `total` counts only `qty > 0` rows and `prepped` counts rows where all three effective flags are true. Test cases: empty category (0/0), all excluded (0/0), mix of prepped + not + excluded, singleton + non-singleton rows.
- [ ] `TripPrepProgress.listProgress(list)` aggregates across all categories in the list. Test cases: empty list, single category, multi-category.
- [ ] Category header renders `N/M prepped` next to the existing weight total. When `M === 0`, the counter is hidden (no `0/0 prepped` visual noise).
- [ ] Trip header renders a single overall `N/M prepped` next to the existing totals row. Same hide-on-zero rule.
- [ ] When a row has all three effective flags true, the row renders at ~70% opacity and the three prep cells collapse into a single faint aggregate check glyph in the middle (or leftmost) prep cell, with the other two prep cells blank.
- [ ] Clicking the aggregate check un-condenses the row: it flips one of the three flags back to false (the spec doesn't specify which — use `packed` as the canonical "un-finalize" action) and the three individual cells re-appear.
- [ ] Flipping a single cell from the condensed state works via the aggregate check click — no regressions to click-to-toggle on the expanded rows.
- [ ] Excluded rows (`qty=0`) never condense regardless of their flag state. They render as they did in slice 1 (empty prep cells, excluded row styling).
- [ ] Typecheck, build, deploy clean.

## Owns

- `src/lib/progress.ts` — **new file** — `TripPrepProgress` module. Exports `categoryProgress`, `listProgress`, `isRowFullyPrepped`. Imports and uses `resolvePrepStatus` from `src/lib/prep.ts` — this is the enforcement that there's one source of truth for the singleton rule.
- `src/lib/progress.test.ts` — **new file** — unit tests for the three exported functions.
- `src/TripView.tsx` — render progress counters in both the trip header and each category header; switch the row renderer to check `isRowFullyPrepped` and conditionally render the condensed layout.
- `src/styles.css` — add styles for the condensed row (opacity, spacing for the aggregate check) and for the progress counter label.

## Must not touch

- `src/lib/prep.ts` — resolver is owned by plan `2026-04-11-01`. This plan consumes it read-only.
- Schema / server code — no changes.
- `src/RowEditModal.tsx` — owned by plan `2026-04-11-04`.
- `/to-buy` anything — owned by plan `2026-04-11-05`.
- Existing `item-row.excluded` CSS class — this plan's condensation is a separate concept and should not overlap its rule.

## Defines interfaces

- **`TripPrepProgress` module** in `src/lib/progress.ts` — `categoryProgress(category) → { prepped, total }`, `listProgress(list) → { prepped, total }`, `isRowFullyPrepped(item, ci) → boolean`. Consumed only by the trip view in this plan. No other plan currently consumes it, but it is a durable public surface.

## Pattern exemplar

- **MUST follow the pattern in**: `src/lib/prep.ts` and `src/lib/prep.test.ts` (created in plan #1) — same module shape, same test-harness invocation, same pure-function discipline.
- **Follow the pattern in**: `src/TripView.tsx` — the existing `categoryTotals` function (around line 43) is the sibling for `categoryProgress`. It's a pure reducer over a category's items; the new function matches its calling convention. Totals are rendered via `<Totalish>` components in the trip header; the new counter reuses the same visual placement.

## Tasks

- [ ] Create `src/lib/progress.ts` with the three exports. Use `resolvePrepStatus` to compute effective flags.
- [ ] Create `src/lib/progress.test.ts` with full coverage of: empty list, empty category, mix of rows, singleton + non-singleton, excluded rows, worn items, fully-prepped rows.
- [ ] Add an `npm test` invocation pattern that picks up both `prep.test.ts` and `progress.test.ts` (glob the test script, or list both files). Verify `npm test` runs both.
- [ ] In `src/TripView.tsx`, compute per-category and per-list progress via the new module. Render the counter inline in the category header and the trip header.
- [ ] Hide the counter when `total === 0`.
- [ ] In the row renderer, call `isRowFullyPrepped` to decide between the expanded three-cell layout and the condensed single-aggregate-check layout.
- [ ] Render a condensed row at ~70% opacity with a single faint check glyph occupying one prep cell; leave the other two prep cells empty. Use `CircleCheck` or equivalent from lucide.
- [ ] Wire the aggregate check to `onPatchCi({ packed: false })` so clicking it un-condenses.
- [ ] Add CSS classes for condensed-row styling. Avoid overlapping with the existing `.item-row.excluded` class.
- [ ] Manually smoke-test: create a row in a seed trip, check all three cells, confirm it condenses. Click the aggregate check, confirm it expands and packed is false. Flip `qty=0`, confirm the condensation does not apply to excluded rows.
- [ ] Typecheck, build, commit, deploy.

## Implementation notes

- **Separation of concerns** — `progress.ts` is a pure computation module. It must not import React, lucide, or any rendering code. This keeps it unit-testable with node:test.
- **`isRowFullyPrepped` is a one-liner** — `const e = resolvePrepStatus(item, ci).effective; return e.acquired && e.weighed && e.packed;`. But it's still worth exposing as a named function so the trip view doesn't have to know the rule, and so it's tested.
- **Aggregate check placement** — my suggestion is to render it in the "Pkd" column (the third one) so the Acq/Wgh cells are blank and the aggregate lives in a consistent visual position. Open to a different placement if implementation taste differs.
- **Unpacking from condensed** — clicking the aggregate check flips `packed` to false. Why packed and not acquired or weighed? Because packed is the per-trip fact; uncheckng it reflects "I'm no longer confident this is packed" which is the most natural interpretation of "I'm un-finalizing this row." Library-level flags should not be casually flipped from a row click.
- **Performance** — `categoryProgress` and `listProgress` get recomputed on every render. That's fine for the current trip sizes (dozens to low hundreds of items). No memoization needed in this slice; add it later if the profiler complains.
