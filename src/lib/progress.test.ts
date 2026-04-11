import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryProgress,
  isRowFullyPrepped,
  listProgress,
  resolvePrepStatus,
  type ProgressCategory,
  type ProgressList,
  type ProgressRow,
} from './progress.js';

function row(
  qty: number,
  acquired: boolean,
  weighed: boolean,
  packed: boolean,
): ProgressRow {
  return { qty, effective: { acquired, weighed, packed } };
}

// --- isRowFullyPrepped ---

test('isRowFullyPrepped: all three true and qty>0 → true', () => {
  assert.equal(isRowFullyPrepped(row(1, true, true, true)), true);
  assert.equal(isRowFullyPrepped(row(3, true, true, true)), true);
});

test('isRowFullyPrepped: any flag false → false', () => {
  assert.equal(isRowFullyPrepped(row(1, false, true, true)), false);
  assert.equal(isRowFullyPrepped(row(1, true, false, true)), false);
  assert.equal(isRowFullyPrepped(row(1, true, true, false)), false);
});

test('isRowFullyPrepped: excluded row never fully prepped even if all flags true', () => {
  assert.equal(isRowFullyPrepped(row(0, true, true, true)), false);
});

// --- categoryProgress ---

test('categoryProgress: empty category → 0/0', () => {
  const cat: ProgressCategory = { items: [] };
  assert.deepEqual(categoryProgress(cat), { prepped: 0, total: 0 });
});

test('categoryProgress: all excluded rows (qty=0) → 0/0', () => {
  const cat: ProgressCategory = {
    items: [
      row(0, true, true, true),
      row(0, false, false, false),
      row(0, true, false, true),
    ],
  };
  assert.deepEqual(categoryProgress(cat), { prepped: 0, total: 0 });
});

test('categoryProgress: mixed 3 prepped / 2 not / 1 excluded → 3/5', () => {
  const cat: ProgressCategory = {
    items: [
      row(1, true, true, true),    // prepped
      row(2, true, true, true),    // prepped
      row(1, true, true, true),    // prepped
      row(1, true, false, true),   // not prepped
      row(1, false, true, true),   // not prepped
      row(0, true, true, true),    // excluded — should not count in total
    ],
  };
  assert.deepEqual(categoryProgress(cat), { prepped: 3, total: 5 });
});

test('categoryProgress: singleton + non-singleton rows count uniformly via effective', () => {
  // The module doesn't care where `effective` came from. Both rows below are
  // "fully prepped" by `effective`, one originating from a singleton-item rule
  // and one from a per-trip ci rule. Both should be counted.
  const cat: ProgressCategory = {
    items: [
      row(1, true, true, true),
      row(1, true, true, true),
    ],
  };
  assert.deepEqual(categoryProgress(cat), { prepped: 2, total: 2 });
});

test('categoryProgress: resolver is the single source of truth for singleton rule', () => {
  // Sanity: build a row's `effective` via `resolvePrepStatus` the same way
  // the server does, then feed it through categoryProgress. This is the
  // integration check that prep.ts + progress.ts agree.
  const singletonPrepped = resolvePrepStatus(
    { singleton: true, acquired: true, weighed: true },
    { acquired: false, weighed: false, packed: true },
  );
  const nonSingletonPrepped = resolvePrepStatus(
    { singleton: false, acquired: false, weighed: false },
    { acquired: true, weighed: true, packed: true },
  );
  const nonSingletonPartial = resolvePrepStatus(
    { singleton: false, acquired: true, weighed: true },
    { acquired: true, weighed: false, packed: true },
  );
  const cat: ProgressCategory = {
    items: [
      { qty: 1, effective: singletonPrepped.effective },
      { qty: 1, effective: nonSingletonPrepped.effective },
      { qty: 1, effective: nonSingletonPartial.effective },
    ],
  };
  assert.deepEqual(categoryProgress(cat), { prepped: 2, total: 3 });
});

// --- listProgress ---

test('listProgress: empty list → 0/0', () => {
  const list: ProgressList = { categories: [] };
  assert.deepEqual(listProgress(list), { prepped: 0, total: 0 });
});

test('listProgress: single category delegates to categoryProgress', () => {
  const list: ProgressList = {
    categories: [
      { items: [row(1, true, true, true), row(1, false, false, false)] },
    ],
  };
  assert.deepEqual(listProgress(list), { prepped: 1, total: 2 });
});

test('listProgress: multi-category sums correctly across categories', () => {
  const list: ProgressList = {
    categories: [
      // 1/2
      { items: [row(1, true, true, true), row(1, false, true, true)] },
      // 2/3 (one excluded)
      {
        items: [
          row(1, true, true, true),
          row(1, true, true, true),
          row(1, true, false, true),
          row(0, true, true, true),
        ],
      },
      // 0/0 (empty)
      { items: [] },
      // 0/1 (all not prepped)
      { items: [row(1, false, false, false)] },
    ],
  };
  assert.deepEqual(listProgress(list), { prepped: 3, total: 6 });
});
