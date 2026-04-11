# Row edit modal — weight ↔ weighed auto-coupling

## Parent spec

`docs/specs/2026-04-11-01-prep-for-trip.md`

## What to build

One small behavior change to the existing row-edit modal: when the user edits the weight input and the numeric value actually changes from its initial loaded value, the authoritative `weighed` checkbox auto-flips to `true`. The user can still manually uncheck it before saving. No reverse coupling (clearing the weight or setting it to zero does not auto-uncheck).

The modal must also expose the authoritative `weighed` checkbox as a labeled form field alongside the weight input so the user can see and toggle it. For singleton items the modal reads/writes `items.weighed`; for non-singleton items it reads/writes `category_items.weighed`. The modal uses the resolver's `writeTarget` to dispatch the write to the correct endpoint.

Out of scope in this plan: direct row-cell click-to-toggle — already shipped in plan #1. Acquired and packed checkboxes in the modal — not in this plan; they're only editable via the row cells.

## Type

AFK

## Blocked by

- Blocked by `2026-04-11-01-prep-status-foundation.md` — needs the resolver, schema, and API write paths.

## User stories addressed

- 13 — weight-edit in modal auto-checks weighed
- 14 — user can still manually uncheck if they typed an estimate

## Acceptance criteria

- [ ] Row-edit modal exposes a `Weighed` checkbox adjacent to the weight input. Its initial state reflects `effective.weighed` for the row.
- [ ] Typing a new numeric value into the weight input that differs from the initially-loaded weight automatically sets the weighed checkbox to `true` (before the user clicks save).
- [ ] If the user then manually unchecks the weighed checkbox before saving, saving preserves the unchecked state — no resurrection.
- [ ] If the user edits the weight but later reverts it back to the original value, the checkbox does not auto-revert (simplest rule: once auto-checked, it stays checked unless manually unchecked).
- [ ] Clearing the weight field or typing `0` does NOT auto-uncheck weighed.
- [ ] Saving dispatches the weighed write to the correct endpoint: `PUT /api/items/:id` for singleton items, `PUT /api/category_items/:catId/:itemId` for non-singleton items. Weight is always written to `PUT /api/items/:id` (the weight field lives on the shared item regardless of singleton).
- [ ] After save, the row in the trip view reflects the new weight and the new weighed state immediately (existing optimistic-update flow).
- [ ] Existing modal behavior (name, description, price, url, singleton flag, qty, worn, consumable) is unchanged.
- [ ] Typecheck, build, deploy clean.
- [ ] Manual smoke test: (a) open modal on a singleton item, change the weight, verify weighed auto-checks; save; confirm the trip view reflects both. (b) open modal on a non-singleton item, same flow, confirm `category_items.weighed` was written. (c) open modal, change weight, manually uncheck, save; verify unchecked wins.

## Owns

- `src/RowEditModal.tsx` — the entire file. Add the weighed checkbox form field, add the auto-check effect when weight changes, dispatch save to the correct endpoint via the resolver.
- `src/api.ts` — verify `patchItem` (added in plan #1) accepts the `weight` and `weighed` fields. If it doesn't, extend the allowed fields. No new function.

## Must not touch

- `src/lib/prep.ts` — consume only. Owned by plan #1.
- `src/TripView.tsx` — trip view row rendering is owned by plans #1 and #3. The modal interaction must not require trip-view changes.
- Schema or server endpoints — no changes.
- `/to-buy` anything — owned by plan #5.

## Defines interfaces

None — this plan only consumes the resolver and existing API endpoints.

## Pattern exemplar

- **Follow the pattern in**: `src/RowEditModal.tsx` itself. The modal already has the pattern for split-write (fields to `items` vs fields to `category_items`). Extend that same pattern to the weighed field. Look at how the existing `singleton` field (library-level) is split from the `qty`/`worn`/`consumable` fields (trip-level).
- **Follow the pattern in**: `src/TripView.tsx` prep cell click-to-toggle wiring (created in plan #1) — the resolver-based write dispatch logic is the sibling. Use the same `resolvePrepStatus().writeTarget.weighed` lookup to decide which endpoint to hit.

## Tasks

- [ ] Read `src/RowEditModal.tsx` and locate the weight input and the existing split-write logic.
- [ ] Add a weighed checkbox form field next to the weight input. Initialize its state from the loaded row's `effective.weighed`.
- [ ] Track the initial weight value at mount; compare against the current weight value in a `useEffect`. When they differ and the user has not manually unchecked weighed since mount, set weighed to `true`.
- [ ] Manual-uncheck handling: if the user clicks the checkbox to uncheck, set a "manually overridden" flag; subsequent weight edits in the same modal session do NOT re-auto-check.
- [ ] In the save handler, dispatch weighed via `resolvePrepStatus(item, ci).writeTarget.weighed`:
  - `'item'` → include in the `PUT /api/items/:id` body
  - `'categoryItem'` → include in the `PUT /api/category_items/:catId/:itemId` body
- [ ] Weight is written to `PUT /api/items/:id` as today (it's always library-level).
- [ ] Typecheck, build, deploy.

## Implementation notes

- **"Manual override" latch** — the simplest implementation is a `useRef` or local state boolean `userOverrodeWeighed` that's set to true the first time the user interacts with the checkbox. The auto-check effect checks this latch before running. Reset on modal close.
- **Weight comparison** — compare numerically, not as a string, because the input may have leading zeros or different formats. Something like `Number(currentWeight) !== Number(initialWeight)` and also gate on `!Number.isNaN(Number(currentWeight))` to avoid auto-checking on a half-typed value. Edge case: if the user is mid-typing `1.5` they'll momentarily type `1.` which is NaN — don't auto-check on NaN.
- **Don't auto-check on mount** — the auto-check effect must NOT fire on the initial render (when `currentWeight` equals `initialWeight`). Guard on "has the user actually changed the value."
