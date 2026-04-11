// TripPrepProgress — pure computation module for per-category and per-list
// "N/M prepped" counters, plus the fully-prepped row predicate that drives
// row condensation in the trip view.
//
// The rule:
//   - Denominator (M) counts only rows with qty > 0 (excluded rows drop out).
//   - Numerator (N) counts rows whose three effective prep flags are all true.
//   - `effective` on a CategoryItem is authoritative — it was computed server
//     side via `resolvePrepStatus` from `./prep.ts`, which is THE source of
//     truth for the singleton rule. We read it rather than re-deriving, so
//     there's one place the rule lives.
//
// Zero React, zero lucide, zero side effects — must stay unit-testable with
// node:test.

import { resolvePrepStatus, type CiPrep, type ItemPrep } from './prep.js';

export type ProgressCounts = { prepped: number; total: number };

// Minimal shape this module needs off a CategoryItem. Using a structural
// subset keeps the tests lightweight (no need to synthesize every CI field).
export type ProgressRow = {
  qty: number;
  effective: { acquired: boolean; weighed: boolean; packed: boolean };
};

export type ProgressCategory = {
  items: ProgressRow[];
};

export type ProgressList = {
  categories: ProgressCategory[];
};

export function isRowFullyPrepped(row: ProgressRow): boolean {
  if (row.qty <= 0) return false;
  const e = row.effective;
  return e.acquired && e.weighed && e.packed;
}

export function categoryProgress(cat: ProgressCategory): ProgressCounts {
  let prepped = 0;
  let total = 0;
  for (const row of cat.items) {
    if (row.qty <= 0) continue;
    total += 1;
    if (isRowFullyPrepped(row)) prepped += 1;
  }
  return { prepped, total };
}

export function listProgress(list: ProgressList): ProgressCounts {
  let prepped = 0;
  let total = 0;
  for (const cat of list.categories) {
    const c = categoryProgress(cat);
    prepped += c.prepped;
    total += c.total;
  }
  return { prepped, total };
}

// Re-export the resolver so consumers that want to re-derive `effective` from
// raw fields (e.g. defensive server/client drift checks) have a single import.
// Not used by the functions above — they trust the pre-resolved `effective`.
export { resolvePrepStatus };
export type { CiPrep, ItemPrep };
