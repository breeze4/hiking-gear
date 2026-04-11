// Pure resolver for the prep-for-trip status rule.
//
// The singleton flag on an item controls where the authoritative value for
// `acquired` and `weighed` lives:
//   - singleton=true  → library-level (items table) — carries across trips.
//   - singleton=false → per-trip (category_items table).
// `packed` is always per-trip, regardless of singleton.
//
// This module has zero non-type imports and is imported by both the client
// (TripView, tests) and the server (list-detail shaping). Keep it pure.

export type ItemPrep = {
  singleton: boolean;
  acquired: boolean;
  weighed: boolean;
};

export type CiPrep = {
  acquired: boolean;
  weighed: boolean;
  packed: boolean;
};

export type PrepEffective = {
  acquired: boolean;
  weighed: boolean;
  packed: boolean;
};

export type PrepWriteTarget = {
  acquired: 'item' | 'categoryItem';
  weighed: 'item' | 'categoryItem';
  packed: 'categoryItem';
};

export type PrepStatus = {
  effective: PrepEffective;
  writeTarget: PrepWriteTarget;
};

export function resolvePrepStatus(item: ItemPrep, ci: CiPrep): PrepStatus {
  const singleton = item.singleton;
  return {
    effective: {
      acquired: singleton ? item.acquired : ci.acquired,
      weighed: singleton ? item.weighed : ci.weighed,
      packed: ci.packed,
    },
    writeTarget: {
      acquired: singleton ? 'item' : 'categoryItem',
      weighed: singleton ? 'item' : 'categoryItem',
      packed: 'categoryItem',
    },
  };
}
