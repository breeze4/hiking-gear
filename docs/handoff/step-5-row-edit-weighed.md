# Step 5 — Row edit: weight ↔ weighed coupling (handoff)

## 1. Manual-override latch location

`src/RowEditModal.tsx`, component-body ref:

```ts
const userOverrodeWeighed = useRef(false);
```

The ref flips to `true` the first time the user interacts with the Weighed
checkbox in the `onChange` handler. It is component-scoped, so a close/reopen
cycle re-mounts the modal and naturally resets the latch — no manual cleanup
needed.

## 2. Auto-check condition

The `useEffect` watching `[weight, unit, initialWeightMg]` fires the
`setWeighed(true)` call if and only if ALL of the following hold:

1. `userOverrodeWeighed.current === false` — user has not manually toggled yet.
2. `weight.trim() !== ''` — field is not empty (clearing the input does NOT
   auto-flip anything).
3. `Number.isFinite(Number(weight)) === true` — guards half-typed values like
   `"1."` or `""` from producing NaN.
4. `unitToMg(Number(weight), unit) !== initialWeightMg` — the numeric value in
   mg (resolved against the currently-selected unit) differs from the
   initially-loaded value.

`initialWeightMg` is a `useState` captured at mount from `item.weight`, so
subsequent edits do not shift the baseline. There is no reverse coupling:
reverting the weight back to the original value leaves `weighed` in whatever
state it was last set to.

The effect also depends on `unit`, so switching units (e.g. g → kg) without
changing the displayed number will re-evaluate against `initialWeightMg`. If
the new (unit, number) pair resolves to the same mg, nothing happens; if it
resolves to a different mg, weighed auto-flips.

## 3. Save dispatch via writeTarget

In `handleSave`:

```ts
if (weighed !== item.effective.weighed) {
  if (item.writeTarget.weighed === 'item') {
    itemPatch.weighed = weighed;       // → PUT /api/items/:id
  } else {
    ciPatch.weighed = weighed;         // → PUT /api/category_items/:catId/:itemId
  }
}
```

- Singleton items: `writeTarget.weighed === 'item'`, so the flag rides along
  in the same `PUT /api/items/:id` request that carries `weight` and
  `authorUnit`. Both become library-level.
- Non-singleton items: `writeTarget.weighed === 'categoryItem'`, so the flag
  is split out into the `PUT /api/category_items/:catId/:itemId` request.
  Weight still goes to the items endpoint (it's always library-level).

The `ciPatch` type was widened from
`{ qty?; worn?; consumable? }` to also accept `weighed?: boolean`.

### Optimistic patched result

Because `CategoryItem` has no top-level `weighed` field (step 1 shipped
`itemWeighed`/`ciWeighed`/`effective.weighed` instead), the optimistic patched
object explicitly rebuilds the three fields:

```ts
const weighedWritten = 'weighed' in itemPatch || 'weighed' in ciPatch;
const patched: CategoryItem = {
  ...item,
  ...itemPatch,
  ...ciPatch,
  itemWeighed:
    item.writeTarget.weighed === 'item' && 'weighed' in itemPatch
      ? weighed
      : item.itemWeighed,
  ciWeighed:
    item.writeTarget.weighed === 'categoryItem' && 'weighed' in ciPatch
      ? weighed
      : item.ciWeighed,
  effective: {
    ...item.effective,
    weighed: weighedWritten ? weighed : item.effective.weighed,
  },
} as CategoryItem;
```

This ensures the TripView row prep cell reflects the new `effective.weighed`
immediately after save without a round-trip.

## 4. Deviations

None. The plan was followed as written; the ciPatch type widening and
optimistic `patched` reconstruction are exactly as the Step 5 prompt
described.

## 5. Not touched

- `src/lib/prep.ts`, `src/lib/progress.*`, `src/TripView.tsx` — untouched.
- `src/api.ts` — verified; no changes needed (step 1 already widened the
  helper body types to accept `weighed`).
- Server, schema — untouched.
- Acquired/packed checkboxes in the modal — intentionally NOT added. Modal
  only exposes weighed, per scope.
- Reverse coupling (weight cleared → uncheck) — intentionally NOT added.
