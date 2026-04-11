# Prep for Trip — Per-item Status Tracking

## Problem Statement

In the days and weeks leading up to a trip, I need to systematically work through my gear list: confirm I own each item, put the important ones on a scale to capture real weights instead of placeholders, and finally consolidate everything into a hamper / go-pile so I know nothing's missing. Today I do this in a mix of spreadsheets, lighterpack checkmarks, and TODO notes on my phone. None of those live next to the actual gear list, so nothing reinforces the other — I arrive at the trailhead and discover I never weighed the new tent, or I'm three weeks out planning and can't easily see which items I still need to buy across the trips I have in flight.

The hiking-gear app already owns the gear list. It should also own the prep state, so I have one place to work through the checklist and one place to glance at "what's still unprepped."

## Solution

Add three per-item prep statuses — **acquired**, **weighed**, **packed** — that live on the trip view next to each gear row. Click-to-toggle directly on the row cells. When a row's three statuses are all checked the row visually recedes, so the trip view naturally sorts itself into "loud rows that need work" and "quiet rows that are done." A per-category and a per-trip progress readout reinforce the workflow.

A dedicated `/to-buy` screen aggregates every unacquired item across all non-archived trips, deduped by item, so I can make purchasing decisions with enough lead time.

Two of the statuses (acquired, weighed) can live at two different levels depending on whether the item is a singleton or a multi-qty item, because the physical meaning is different:

- **Singleton items** (tent, stove, headlamp — most gear): acquired and weighed are one-time facts about the item itself. Once I own the tent and weighed it, every trip that uses it inherits that truth.
- **Non-singleton items** (fuel, food, batteries, bars — consumables and multi-count supplies): acquired and weighed are per-trip facts, because I buy fuel afresh for every trip.

Packed is always per-trip — it's the final "in the hamper" step and resets whenever I start prepping a new trip.

## User Stories

1. As a trip planner, I want to see three checkboxes per gear row so I can tell at a glance which items still need prep.
2. As a trip planner, I want to click a prep checkbox directly in the table to flip it, so marking progress is friction-free.
3. As a trip planner, I want a fully-prepped row to visually recede, so the trip view guides my attention to what still needs work.
4. As a trip planner, I want a "4/7 prepped" counter on each category, so I can prioritize finishing one section before moving on.
5. As a trip planner, I want an overall "22/41 prepped" counter on the trip header, so I can feel progress across the whole trip.
6. As a gear owner, I want singleton items' acquired and weighed flags to carry forward to every trip that uses them, so I'm not re-confirming facts about gear I own once per trip.
7. As a trip planner, I want non-singleton consumables (fuel, bars) to track acquired and weighed per-trip, because I re-buy and re-weigh them every time.
8. As a trip planner, I want packed state to reset when I clone a trip or start a new one, because the consolidation pile is a fresh act each trip.
9. As a trip planner, I want worn items (jacket, trail runners) to participate in packed tracking too, because my final prep step is laying everything out in one pile regardless of whether it ends up on my body or in the pack.
10. As a gear buyer, I want a dedicated `/to-buy` screen listing every unacquired item across my trips, so I can plan purchases with long lead times.
11. As a gear buyer, I want the `/to-buy` screen deduped by item, so I don't see the same tent listed under three trips.
12. As a gear buyer, I want to mark an item acquired from the `/to-buy` screen and have that ripple to every trip that needs it.
13. As a trip planner, I want weight-edit in the row modal to auto-check weighed, so the common "put it on the scale, type the number" flow is one interaction instead of two.
14. As a trip planner, I want editing a weight but NOT having weighed it yet to stay rare — typical flow is scale-first — but I should still be able to manually uncheck if I typed a guess.
15. As a trip planner, I want excluded rows (qty=0, the "leave it off" state) to hide their prep checkboxes, because I'm not bringing them on this trip and their prep status is noise.
16. As a trip planner, I want excluded rows to not count toward category or trip prep denominators, so "4/7 prepped" reflects what I'm actually bringing.
17. As a trip planner, I want restoring an excluded row (qty=0 → 1) to preserve whatever trip-level flags were there before, so I don't lose progress from an earlier indecision.
18. As a trip planner, I want defaults on newly-added items to match common sense: lighterpack import = already acquired/weighed (I owned and weighed them), template-spawned items = not acquired, template with real weights = weighed, template with placeholders = unweighed.
19. As a trip planner, I want library-level flags (singleton acquired/weighed) to never be disturbed by cloning a trip, because the gear fact doesn't change when I make a new trip.
20. As a trip planner, I want prep state toggles to be independent — no gating between them — so I can check Packed without Acquired if my workflow happens to run out of order.
21. As a trip planner, I want the `/to-buy` screen empty state to be reassuring ("Nothing to buy — you're all set.") so I can close the loop on a planning session.
22. As a gear buyer, I want non-singleton "acquired" on the `/to-buy` screen to bulk-resolve all trips that need that item in one click, because I'm buying enough for all of them at once.
23. As a trip planner, I want a fresh trip that reuses an existing singleton item to inherit the library's acquired/weighed state but start fresh on packed, so the prep flow focuses me on what's actually new to do.

## Data Flow

### Schema migrations

All appended as idempotent PRAGMA-check blocks in the db initialization, consistent with existing migrations.

- `items.acquired INTEGER NOT NULL DEFAULT 0` — authoritative for singleton items.
- `items.weighed INTEGER NOT NULL DEFAULT 0` — authoritative for singleton items.
- `category_items.acquired INTEGER NOT NULL DEFAULT 0` — authoritative for non-singleton items.
- `category_items.weighed INTEGER NOT NULL DEFAULT 0` — authoritative for non-singleton items.
- `category_items.packed INTEGER NOT NULL DEFAULT 0` — authoritative for all items.

### Authoritative field resolution

Given a joined row of `{ item, category_item }`, the UI and server helpers resolve the effective flags as:

```
effective.acquired = item.singleton ? item.acquired : category_item.acquired
effective.weighed  = item.singleton ? item.weighed  : category_item.weighed
effective.packed   = category_item.packed
```

Writes go to the authoritative side and only the authoritative side. A non-singleton item never reads or writes `items.acquired` / `items.weighed`; a singleton item never reads or writes `category_items.acquired` / `category_items.weighed`. Flipping the `singleton` flag on an existing item is a no-op for prep data — the non-authoritative side is simply unused from then on; we do not migrate existing prep state across the boundary.

### API

- **Item PATCH endpoint** (existing) accepts `acquired` and `weighed` fields. Used for singleton items.
- **Category-item PATCH endpoint** (existing) accepts `acquired`, `weighed`, and `packed` fields. Used for non-singleton items and packed on all items.
- **List detail endpoint** (existing) includes resolved `effective.{acquired,weighed,packed}` on each category-item row, so the frontend doesn't have to know the singleton-based resolution rule — the server computes it. The raw authoritative fields are also included for completeness and for the row-edit modal.
- **New endpoint** `GET /api/to-buy`: returns a flat list of deduped library items that are currently unacquired anywhere across non-archived trips. For each item: the library fields (name, weight, price, author unit, url, image url, singleton) plus a computed `neededQty` that is (for singletons) 1 or (for non-singletons) the sum of `category_items.qty` across non-archived trips where `acquired=false` and `qty>0`. Excluded rows (`qty=0`) are not counted.
- **New endpoint** `POST /api/to-buy/acquire` with body `{ itemId }`: for singletons, sets `items.acquired=1`. For non-singletons, sets `category_items.acquired=1` on every row across non-archived trips.

### Frontend reads/writes

- **Trip view** renders three status columns between "Cons" and "Weight". Each cell is click-to-toggle, optimistic, calls the appropriate PATCH endpoint based on field authority.
- **Trip view** computes category progress (`prepped / total` where total excludes `qty=0`) and trip progress on the client from the same category-items data it already has.
- **Row-edit modal** exposes the authoritative fields for editing. When the weight number is changed, the weighed checkbox auto-checks. The user can still manually uncheck before saving.
- **`/to-buy` screen** is a new route in the top nav, calls `GET /api/to-buy`, renders the flat deduped list with per-row "Mark acquired" buttons that call the new POST endpoint and optimistically remove the row.

## Behavior

### Status semantics and levels

- **Acquired**: "I physically own (or have enough of) this item."
  - Singleton → library-level (`items.acquired`).
  - Non-singleton → per-trip (`category_items.acquired`).
- **Weighed**: "I put this on a scale and captured a real weight."
  - Singleton → library-level (`items.weighed`).
  - Non-singleton → per-trip (`category_items.weighed`).
- **Packed**: "I placed this in the final consolidation pile/hamper for this specific trip."
  - Always per-trip (`category_items.packed`).
  - Applies uniformly to all rows including `worn=true` rows (worn items still enter the hamper for the final sanity check).

### Trip view — row display

- Three new columns, in order: **Acq**, **Wgh**, **Pkd**, placed between the Cons column and the Weight column.
- **Unchecked cell**: prominent — an empty circle outline, with a colored accent (e.g. muted-foreground for default, a subtle alert tone acceptable).
- **Checked cell**: quiet — a small filled check glyph in muted-foreground.
- **Click-to-toggle**: clicking a cell flips the value and writes optimistically to the server. No modal, no confirm. Errors roll the UI back, consistent with existing `onPatchCi` behavior.
- **Fully-prepped row condensation**: when all three effective flags are true on a row (regardless of singleton/non-singleton), the row as a whole fades to ~70% opacity and the three prep cells visually collapse to a single faint aggregate check to reduce noise. Any status flipping back to false snaps the row back to full prominence.
- **Excluded rows (`qty=0`)**: prep cells render as `—` (or blank), are not clickable, and do not count toward category or trip denominators. Row opacity/styling from the existing `excluded` class is unchanged by this feature.

### Trip view — progress readouts

- **Category header**: next to the existing weight total, show `N/M prepped` where N is the count of rows where all three effective flags are true, and M is the count of rows with `qty > 0`. Both computed from the same category-items list used for the weight totals.
- **Trip header**: a single trip-wide `N/M prepped` next to the existing trip-level totals, computed as the sum of all non-excluded category-items across all categories.

### Weight-edit ↔ weighed interaction

- In the row-edit modal, editing the weight value auto-flips the authoritative `weighed` field to true. The user can manually uncheck before saving if they typed an estimate. No auto-flip in the other direction (typing 0 or clearing the field does not auto-uncheck).
- Direct click-to-toggle on the Wgh column cell is independent of the weight number and has no auto-behavior.

### Defaults

| Entry point | `acquired` default | `weighed` default | `packed` default |
|---|---|---|---|
| **Lighterpack import** | `true` (item-level for singletons, or category-item-level for non-singletons — both set to true because the lighterpack export represents gear the user already has and has weighed) | `true` | `false` |
| **Template → new trip, real weights** | `false` | `true` | `false` |
| **Template → new trip, weight placeholders** | `false` | `false` | `false` |
| **Add existing library item to a trip** | singleton: inherit from library `items.acquired`; non-singleton: `false` | singleton: inherit from library `items.weighed`; non-singleton: `false` | `false` |
| **Create brand-new item via trip "new item" form** | `false` (item and/or category-item depending on singleton) | `false` | `false` |
| **Clone trip** | singleton: inherit from library (untouched); non-singleton: `false` | singleton: inherit from library (untouched); non-singleton: `false` | `false` |

### Excluded row restore (`qty=0 → qty=1`)

- Trip-level flags (`category_items.acquired`, `category_items.weighed`, `category_items.packed`) are preserved exactly as they were before the row was excluded — we never zero them on exclusion, so the restore is a no-op for prep state.
- Library-level flags (`items.acquired`, `items.weighed`) were never touched by exclusion and are unaffected by restore.

### Gating

- All three statuses are independent. No validation prevents marking Packed without Acquired, or any other order combination. The workflow is user-driven; the app does not enforce ordering.

### `/to-buy` screen

- New route, linked from the top nav alongside Templates and Items.
- Loads via `GET /api/to-buy` — a flat list deduped by library item.
- Rows show: item name, per-item weight + author unit, price, needed-qty (for non-singletons this is the sum across trips), an optional link thumbnail / url, and a single "Mark acquired" button.
- Clicking "Mark acquired" calls `POST /api/to-buy/acquire` and optimistically removes the row. For singleton, this flips `items.acquired`. For non-singleton, this flips every matching `category_items.acquired` across non-archived trips.
- **No trip references shown**: the user explicitly doesn't want to see which trips need each item. The screen is a shopping list, not a cross-trip inspector.
- **Empty state**: "Nothing to buy — you're all set."
- **Archived trips are excluded** from the aggregation, consistent with how archived trips are treated elsewhere in the app.
- **Excluded rows (`qty=0`) are not counted** — a fuel canister marked "leave it off" shouldn't drive a purchase.

### Interaction with existing features

- The existing "weight placeholder" notion from the original project spec (template items imported with `weight=0` and flagged incomplete) is now subsumed by the `weighed` flag. A placeholder-imported item has `weight=0` and `weighed=false`; once the user enters a real weight in the row-edit modal, weighed auto-flips to true and the item is no longer a placeholder.
- Cloning a trip preserves everything the quantity-controls spec already preserves (qty, worn, consumable, position, priority) and additionally resets `category_items.packed` to 0. Non-singleton `category_items.{acquired,weighed}` are also reset to 0 per the defaults table above.
- The row-actions cluster (hide/restore/remove/edit buttons from the shadcn row-actions work) is unchanged. The three prep columns sit to the left of the weight column and are orthogonal to the row-actions cluster.

## Modules

- **PrepStatusResolver**: pure function that, given `{ item, category_item }`, returns `{ effective: { acquired, weighed, packed } }` using the singleton rule.
  - Role: **defines** the authoritative-field resolution rule shared by server and client.
  - Interface: `resolvePrepStatus(item, categoryItem) → { effective, writeTarget }` where `writeTarget` names which side (`item` or `categoryItem`) a write to a given field should land on. This is the single place the singleton rule is encoded.
  - Test: yes — the resolution table is the subtle part and is the load-bearing invariant that keeps server and client in sync. Unit test every cell of the truth table (singleton × flag).

- **PrepStatusCell**: the per-cell click-to-toggle UI element rendered in the three trip-view columns.
  - Role: **consumes** the resolver's `writeTarget` to decide which PATCH endpoint to hit.
  - Interface: takes `{ item, categoryItem, field }` and emits `onPatch(target, field, value)` to the parent, mirroring the existing `onPatchCi` / item PATCH seams.
  - Test: no — thin presentational wrapper. Behavior verified by manual smoke testing and the trip view's overall integration.

- **TripPrepProgress**: pure computation of the `N/M prepped` counts for a category and for a whole list.
  - Role: **consumes** the resolver.
  - Interface: `categoryProgress(category) → { prepped, total }` and `listProgress(list) → { prepped, total }`. `total` excludes `qty=0` rows; `prepped` requires all three effective flags true.
  - Test: yes — cheap to test and the category/trip counters depend on it being correct across singleton, non-singleton, worn, excluded, and partial-prep combinations.

- **ToBuyAggregator**: server-side query that produces the `/to-buy` deduped list.
  - Role: **defines** the `/api/to-buy` response shape.
  - Interface: `buildToBuyList() → Array<{ item, neededQty }>`. Pulls from `items` and `category_items` joined through non-archived `lists`, filters to "effectively unacquired" using the resolver, dedupes by item id, sums qty for non-singletons.
  - Test: yes — covers singleton-only items, non-singleton-only items, mixed trips, excluded rows, archived trips, and the edge case where a non-singleton item appears on some trips as acquired and others as unacquired (it should appear in the list with the unacquired qty only).

- **ToBuyAcquireAction**: server-side bulk-acquire handler for `POST /api/to-buy/acquire`.
  - Role: **consumes** the resolver's write-target rule.
  - Interface: `acquireItem(itemId)` flips the authoritative `acquired` field everywhere it applies (one row for singletons, many for non-singletons).
  - Test: yes — verifies the singleton-vs-non-singleton dispatch and that archived trips are not touched.

- **RowEditModal weight↔weighed coupling**: existing modal gains one new behavior — when the weight input changes value from its original, the authoritative weighed checkbox auto-flips to true. User can still manually uncheck before saving.
  - Role: **consumes** the existing RowEditModal plumbing.
  - Interface: no new contract; it's a UI-internal side effect.
  - Test: no — behavior is simple enough and visible in manual testing. If the RowEditModal later grows its own test harness this is worth adding.

## Resolved Decisions

- **Storage split by singleton flag**: singleton items store acquired/weighed on the `items` table; non-singleton items store them on `category_items`. Packed is always on `category_items`. Rejected: a single uniform location (would break the mental model — singleton acquired is a library fact, non-singleton acquired is a per-trip fact). Rejected: mirroring on both sides (sync complexity without payoff).
- **Click-to-toggle on cells**: the common case is rapid progression through a checklist; modal-based editing was dismissed as too slow for the primary workflow. Row-edit modal is reserved for editing the underlying weight number, name, etc.
- **Weight-edit auto-checks weighed**: the primary workflow is "put it on the scale, type the number," and that should be one interaction. The user can still uncheck manually if they're entering an estimate. Rejected: auto-uncheck on weight change (wrong-direction default); rejected: no coupling at all (introduces a second mandatory click to the common case).
- **Three columns, not a single compact pill or a status row**: scannability down a column matters for "find what's left to prep." Pills and clustered-icon approaches were harder to scan vertically.
- **Fully-prepped row condenses to ~70% opacity + aggregate check**: condensation applies to all rows regardless of singleton status. The visual state is driven by the effective flags, not the storage level. Rejected: hiding prepped rows entirely (loses the ability to glance at what's already done); rejected: condensing only singletons (inconsistent visual rule across rows).
- **Category header counts + trip header count**: both levels of readout. Rejected: trip-only (loses the "finish the kitchen category first" prioritization signal); rejected: category-only (loses the overall progress feeling).
- **Excluded rows (`qty=0`) do not show prep status and do not count toward denominators**: prepping something you're leaving off the trip is noise. Restore preserves trip-level flags exactly as they were (we never zero them on exclusion).
- **Status toggles are independent — no gating**: user workflows run out of order. Enforcing "acquired before packed" introduces friction and false-error states without preventing any real mistake.
- **`/to-buy` is a dedicated route, deduped by item, no trip references**: the user wants a shopping list, not a cross-trip inspector. A click-through map from item back to trips is not in scope.
- **Non-singleton bulk-acquire from `/to-buy`**: one click marks every trip that needs the item. Assumes the user bought enough for all trips at once. Rejected: per-trip granularity on the `/to-buy` screen (user explicitly rejected cross-trip trip references there).
- **Worn items still participate in Packed**: packed semantics are "in the consolidation pile ready to leave," and worn items end up in the pile too for the final sanity pass.
- **Lighterpack-imported items default `acquired=true, weighed=true`**: the export represents gear the user already owns and has weighed. Template items default to unacquired (they're suggestions) and to weighed=true only when the template carries real weights.
- **Flipping the `singleton` flag on an existing item does not migrate prep state** between the two storage levels. Edge case, cheap to leave uncovered.

## Judgment Calls

_All decisions resolved during interview — no open items._

## Testing Decisions

- **PrepStatusResolver**: unit-test the full singleton × flag × value truth table. This is the load-bearing invariant for the entire feature. Prior art: the `weight.ts` module's unit helpers are pure and testable, but no test harness currently exists in the repo. Adding a minimal node:test or vitest harness is in-scope for this module even if nothing else tests into it yet.
- **TripPrepProgress**: unit tests over the resolver, covering singleton, non-singleton, excluded, worn, partial-prep, and fully-prepped rows. Uses the same test harness as the resolver.
- **ToBuyAggregator**: integration-style test against a temporary sqlite file (the repo already uses `better-sqlite3` and can open in-memory or on a temp path). Covers the query's dedupe, aggregation, archived-exclusion, and effectively-unacquired logic.
- **ToBuyAcquireAction**: same test harness as the aggregator. Covers the singleton-vs-non-singleton write dispatch and the archived-trip exclusion on writes.
- **Frontend verification**: no component test framework exists in the repo. Trip view status cells, condensation behavior, progress counters, and the `/to-buy` screen will be verified by manual smoke test against the deployed build plus agent-browser screenshots of the key visual states: (a) a trip with a mix of prepped and unprepped rows, (b) a trip where every row is prepped (condensation visible), (c) the `/to-buy` screen populated, (d) the `/to-buy` screen empty state. Surfaced gap: the RowEditModal weight↔weighed auto-check behavior has no test coverage and relies on manual verification.
- **Typecheck** (`npx tsc --noEmit`) remains the primary gate for anything that doesn't have a dedicated test.

## Out of Scope

- **Wishlist** — a separate "gear I'm considering buying" concept that's not tied to any trip. Explicitly a follow-up feature, not part of this spec.
- **Packing mode / dedicated prep screen** — all prep interaction happens inside the existing trip view. No modal wizard, no guided step-through flow, no alternate view that hides existing columns.
- **Trailhead / on-trail use** — prep is an at-home activity. No offline sync, no mobile-specific UI beyond what the existing responsive layout already provides.
- **Prep history / audit log** — we don't store when a status was flipped or who flipped it. The current state is the only source of truth.
- **Gating / workflow enforcement** — statuses are independent booleans. No "can't pack without acquiring" validation.
- **Per-trip `/to-buy` filtering** — the `/to-buy` screen is a single deduped aggregate. Filtering by trip, category, price, or weight is not in v1.
- **Bulk toggles from the trip view** — no "mark all acquired in this category" action. Users click individual cells.
- **Notifications / reminders** — no emails, no push, no prompts to prep. The screen is the reminder.
- **Cross-trip inspector** from `/to-buy` — clicking an item does not show which trips use it. That was explicitly rejected in the interview.
- **Renaming "Packed" to "Ready"** — keeps the user-chosen name "Packed" throughout despite the loose consolidation-pile semantics.
