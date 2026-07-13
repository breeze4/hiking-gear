# Template Trip Creation Repair

## Problem

The current template flow creates a checklist-shaped trip, not a usable packing list.

- Template defaults treat `Contingent` as selected and `Suggested` as unselected. The intended semantics are the reverse: `Contingent` is optional and `Suggested` is normally brought.
- Items linked manually have no priority, so the tag disappears outside template creation.
- Template creation resolves library gear by exact generic name. It silently creates zero-weight placeholders when the user's actual item has a specific name such as `Backpack`, `Quilt`, or `Rain jacket`.
- Exact-name collisions select an arbitrary old item. A generic `Stove` requirement can resolve to the wrong stove system.
- The resulting rows often lack weight and meaningful item identity, forcing a second manual rebuild.
- Changing trips in the dropdown changes the data without changing `?list=`, leaving stale URLs and broken navigation history.

## Semantics

| Priority | Default selected | Meaning |
| --- | --- | --- |
| Critical | Yes | Required for the trip or safety system |
| Suggested | Yes | Normal recommendation; bring by default |
| Contingent | No | Bring only when the stated condition applies |
| Optional | No | Personal preference or comfort item |
| Unnecessary | No | Deliberately excluded |

Manual additions default to `Suggested` and expose priority in the row editor.

## Real Item Resolution

Template requirements and library items are different entities and must not be conflated by name.

1. Each selected template requirement must carry either a chosen library `itemId` or an explicit unresolved state.
2. The creation screen should suggest real items using category history, recency, usage, and normalized aliases, but show the chosen item's name, description, weight, and type before creation.
3. Requirements with multiple valid systems, especially shelter, sleep, stove/fuel, and water treatment, require an explicit user choice. Selecting a stove must also select the compatible fuel container and fuel.
4. Do not create permanent zero-weight library records implicitly. An unresolved requirement stays visible in the creation review and blocks creation unless the user explicitly chooses "create placeholder".
5. The API must accept `{ templateItemId, itemId, priority }` selections and persist the template priority on the trip relationship.
6. The review must flag chosen items with zero weight or an unconfirmed weighed state before the trip is created.

## Delivered First Pass

- Trip dropdown and browser navigation keep `?list=` synchronized.
- Template defaults select `Critical` and `Suggested`, not `Contingent`.
- Manual category links default to `Suggested`.
- Priority can be edited on an existing trip row.

## Acceptance Criteria For Resolver Follow-up

- Creating a PNW trip from the 3-season template produces actual owned gear rows with weights for the pack, shelter, sleep, kitchen, hydration, navigation, and core clothing systems.
- A canister-stove selection cannot silently resolve to an alcohol or integrated stove system.
- No zero-weight placeholder is created without an explicit confirmation.
- The creation review shows the actual selected item and weight for every requirement.
- Reload, deep link, back/forward navigation, and mobile trip switching preserve the correct list ID.
