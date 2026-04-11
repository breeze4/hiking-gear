import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrepStatus, type CiPrep, type ItemPrep } from './prep.js';

function item(partial: Partial<ItemPrep> = {}): ItemPrep {
  return { singleton: true, acquired: false, weighed: false, ...partial };
}
function ci(partial: Partial<CiPrep> = {}): CiPrep {
  return { acquired: false, weighed: false, packed: false, ...partial };
}

// (a) singleton=true → effective.acquired/weighed sourced from item
test('singleton=true: effective.acquired mirrors item.acquired', () => {
  for (const a of [false, true]) {
    for (const w of [false, true]) {
      for (const p of [false, true]) {
        const r = resolvePrepStatus(
          item({ singleton: true, acquired: a, weighed: w }),
          ci({ acquired: !a, weighed: !w, packed: p }),
        );
        assert.equal(r.effective.acquired, a, `acquired=${a}`);
        assert.equal(r.effective.weighed, w, `weighed=${w}`);
        assert.equal(r.effective.packed, p, `packed=${p}`);
      }
    }
  }
});

// (b) singleton=false → effective.acquired/weighed sourced from ci
test('singleton=false: effective.acquired mirrors ci.acquired', () => {
  for (const a of [false, true]) {
    for (const w of [false, true]) {
      for (const p of [false, true]) {
        const r = resolvePrepStatus(
          item({ singleton: false, acquired: !a, weighed: !w }),
          ci({ acquired: a, weighed: w, packed: p }),
        );
        assert.equal(r.effective.acquired, a, `acquired=${a}`);
        assert.equal(r.effective.weighed, w, `weighed=${w}`);
        assert.equal(r.effective.packed, p, `packed=${p}`);
      }
    }
  }
});

// (c) packed always from ci regardless of singleton
test('packed is always sourced from ci, regardless of singleton', () => {
  for (const singleton of [false, true]) {
    for (const p of [false, true]) {
      const r = resolvePrepStatus(item({ singleton }), ci({ packed: p }));
      assert.equal(r.effective.packed, p);
    }
  }
});

// (d) writeTarget
test('writeTarget: singleton=true → item for acquired/weighed, categoryItem for packed', () => {
  const r = resolvePrepStatus(item({ singleton: true }), ci());
  assert.equal(r.writeTarget.acquired, 'item');
  assert.equal(r.writeTarget.weighed, 'item');
  assert.equal(r.writeTarget.packed, 'categoryItem');
});

test('writeTarget: singleton=false → categoryItem for all three', () => {
  const r = resolvePrepStatus(item({ singleton: false }), ci());
  assert.equal(r.writeTarget.acquired, 'categoryItem');
  assert.equal(r.writeTarget.weighed, 'categoryItem');
  assert.equal(r.writeTarget.packed, 'categoryItem');
});
