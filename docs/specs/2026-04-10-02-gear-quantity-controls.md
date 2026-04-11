# Gear Quantity Controls & "Leave It Off" State

## Problem

Adjusting gear quantities in the trip view is clunky — editing a qty field to type `0`, `1`, `2`, etc. is too much friction for the common case. Two specific pain points:

1. **Most gear is qty=1.** Tent, sleeping bag, stove, headlamp. Reaching into a number field to add "1 tent" is overkill. A handful of items (stakes, batteries, ziplocks) really are multi-qty.
2. **"Trying on" configurations.** Often the user wants to temporarily zero out an item's weight — waiting on a weather call, comparing two shelters, etc. — without forgetting the item existed. Deleting loses the item; typing `0` is clunky and looks the same as "never added".

## Solution

Two small changes:

1. **`singleton` flag on items** (shared library). Boolean, default `true`. Items flagged singleton get a simple "Add" / "Set to zero" toggle control in the trip view; override to higher qty is available via a pencil affordance. Items flagged multi (`singleton=false`) get the full +/– control with visible qty.

2. **`qty=0` as a first-class "leave it off" state.** No new column — `category_items.qty = 0` already naturally excludes weight from all totals via the existing formulas. The UI treats `qty=0` rows as a persistent "deferred" state: row is dimmed, shows a [Keep it] button (re-adds at 1) and a [Remove] button (deletes the row). This persists across sessions because it's in the DB.

## Data Flow

- **Schema migration**: add `singleton INTEGER NOT NULL DEFAULT 1` column to `items`. No change to `category_items`.
- **Items API**: `GET /api/items` and the item create/update endpoints expose and accept `singleton`.
- **Category-items API**: qty update endpoint already exists; no contract change. Frontend calls it with `qty=0` for "set to zero" and with the prior qty or `1` for "keep it".
- **Totals calculation** (server or client, wherever it currently lives): no change — existing formulas already handle `qty=0` correctly. **Items count** must be updated to filter `qty>0` (verify — may already do this).
- **Trip view row component**: reads `item.singleton` and `category_item.qty` to pick the control layout.
- **Importers**: lighterpack import defaults new items to `singleton=1`. Template-to-trip creation defaults cloned items to `singleton=1`.

## Behavior

### Row controls by state

| State | `singleton` | `qty` | Controls shown |
|---|---|---|---|
| Singleton, included | true | 1 | `[Set to zero]` + pencil-icon affordance to override qty |
| Singleton, overridden | true | >1 | qty display with `+`/`–`, `[Set to zero]`, pencil affordance |
| Multi, included | false | ≥1 | qty display with `+`/`–`, `[Set to zero]` |
| Either, excluded | — | 0 | row **dimmed**, `[Keep it]` + `[Remove]` |

- **Set to zero**: writes `qty=0`. Destructive of prior qty — a multi item at qty=3 that gets set to zero, then re-activated, comes back at qty=1. User accepted this tradeoff to keep the data model simple.
- **Keep it**: writes `qty=1`. Same underlying action as "Add 1" from the item picker — the label differs only because the row already exists on the trip.
- **Remove**: deletes the `category_items` row entirely. Only surfaced when `qty=0` (the button slot is shared with Set-to-zero and flips labels based on current qty, per the interview).
- **Pencil override** (singleton only): reveals an inline number field to set qty to any value. Used rarely — for the "I actually need 2 stoves this trip" case.

### Totals & counts

- Items with `qty=0` contribute **zero** to all weight totals (Base, Worn, Consumable, Pack, Total). Already true by formula.
- **Items count**: must exclude rows with `qty=0`. Verify current implementation; fix if it counts rows instead of qty.
- Excluded rows still render in the trip view (dimmed) — they're not hidden.

### Defaults & existing data

- Migration backfills all existing items with `singleton=1`. Most hiking gear fits this default; user can flip the rare multi-qty items (stakes, batteries, ziplocks) manually.
- New items created via the item picker / "new item" form default to `singleton=1` and expose a checkbox to flip it.
- Template-derived items and lighterpack-import items both default to `singleton=1`.

### Clone / copy behavior

- Cloning a trip preserves each row's `qty` exactly, including `qty=0` rows. The "trying on" state copies forward.
- `singleton` is an item-library property, so it's shared across all trips that reference the item — flipping it on one trip flips it everywhere.

## Resolved Decisions

- **Items count already works**: `TripView` computes Items as `Σ qty` across category_items, so `qty=0` rows contribute zero by construction. No code change needed to the totals calculation for exclusion to work. (Side note: this means "10 stakes" counts as 10 items, not 1 — that behavior is preserved, not changed by this feature.)

- **Pencil affordance is always-visible**: no hover-reveal. Every singleton row renders a subtle pencil icon next to the qty. Reason: this feature exists to reduce friction — hiding the escape hatch behind hover reintroduces friction for the people who need it, and mobile needs always-visible anyway. Visual de-emphasis (low opacity until row hover) handles the row-noise concern.

- **Pencil opens a full row-edit modal**, not a minimal qty field. Scope includes both `category_item` fields (qty, worn, consumable) and shared `items` library fields (name, description, weight + authorUnit, price, url, imageUrl, **singleton**). This consolidates the "edit the singleton flag" concern into the same UI as general item editing — no need to wait for feature #8's library screen, and feature #8 can later reuse this same modal component. Keep the modal simple in v1 (just the fields) but structured so expansion is trivial.

## Modules

- **RowEditModal**: a modal/drawer that edits one `category_items` row plus its underlying `items` row.
  - Role: **consumes** the items and category_items interfaces; does not define new shared contracts.
  - Interface: takes `{ catId, itemId }`, loads the joined row via existing endpoints, writes back via existing PATCH endpoints for items and category_items separately.
  - Test: yes — worth testing the split-write logic (which fields go to which endpoint) since that's the subtle part.
  - Reuse target: feature #8 (`/items` library screen) opens this same modal for non-trip-contextual edits (qty/worn/consumable hidden or disabled).

- **SingletonAwareRowControls**: the per-row control cluster (Add / Set-to-zero / Keep-it / Remove / pencil / +/–).
  - Role: **consumes** `item.singleton` and `category_item.qty` to pick which controls to render.
  - Interface: takes the row state, emits patch actions to the parent (same shape as existing `onPatchCi`).
  - Test: unit test the state → controls mapping table from the Behavior section.

## Judgment Calls

_All decisions resolved during interview — no open items._
