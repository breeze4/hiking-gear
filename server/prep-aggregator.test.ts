import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from './db.js';
import { buildToBuyList, acquireItem } from './prep-aggregator.js';

type TestDb = {
  db: Database.Database;
  cleanup: () => void;
};

function openTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'hiking-gear-test-'));
  const path = join(dir, 'test.db');
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return {
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

type SeedItem = {
  id?: number;
  name: string;
  singleton?: 0 | 1;
  acquired?: 0 | 1;
  weighed?: 0 | 1;
  weight?: number;
  price?: number;
};

function insertItem(db: Database.Database, i: SeedItem): number {
  const res = db.prepare(`
    INSERT INTO items (id, name, description, weight, author_unit, price, image, image_url, url, singleton, acquired, weighed)
    VALUES (?, ?, '', ?, 'oz', ?, '', '', '', ?, ?, ?)
  `).run(
    i.id ?? null,
    i.name,
    i.weight ?? 0,
    i.price ?? 0,
    i.singleton ?? 1,
    i.acquired ?? 0,
    i.weighed ?? 0,
  );
  return i.id ?? Number(res.lastInsertRowid);
}

function insertList(db: Database.Database, name: string, archived: 0 | 1 = 0): number {
  const res = db.prepare('INSERT INTO lists (name, archived) VALUES (?, ?)').run(name, archived);
  return Number(res.lastInsertRowid);
}

function insertCategory(db: Database.Database, listId: number, name: string): number {
  const res = db.prepare('INSERT INTO categories (list_id, name) VALUES (?, ?)').run(listId, name);
  return Number(res.lastInsertRowid);
}

function insertCi(
  db: Database.Database,
  categoryId: number,
  itemId: number,
  opts: { qty?: number; acquired?: 0 | 1; weighed?: 0 | 1; packed?: 0 | 1 } = {},
): void {
  db.prepare(`
    INSERT INTO category_items (category_id, item_id, position, qty, worn, consumable, star, acquired, weighed, packed)
    VALUES (?, ?, 0, ?, 0, 0, 0, ?, ?, ?)
  `).run(
    categoryId,
    itemId,
    opts.qty ?? 1,
    opts.acquired ?? 0,
    opts.weighed ?? 0,
    opts.packed ?? 0,
  );
}

test('empty db → empty to-buy list', () => {
  const { db, cleanup } = openTestDb();
  try {
    assert.deepEqual(buildToBuyList(db), []);
  } finally {
    cleanup();
  }
});

test('singleton acquired item is excluded', () => {
  const { db, cleanup } = openTestDb();
  try {
    const listId = insertList(db, 'Trip A');
    const catId = insertCategory(db, listId, 'Shelter');
    const itemId = insertItem(db, { name: 'Tent', singleton: 1, acquired: 1 });
    insertCi(db, catId, itemId, { qty: 1 });
    assert.deepEqual(buildToBuyList(db), []);
  } finally {
    cleanup();
  }
});

test('singleton unacquired item appears with neededQty=1', () => {
  const { db, cleanup } = openTestDb();
  try {
    const listId = insertList(db, 'Trip A');
    const catId = insertCategory(db, listId, 'Shelter');
    const itemId = insertItem(db, { name: 'Tent', singleton: 1, acquired: 0 });
    insertCi(db, catId, itemId, { qty: 1 });
    const rows = buildToBuyList(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item.id, itemId);
    assert.equal(rows[0].item.singleton, true);
    assert.equal(rows[0].item.acquired, false);
    assert.equal(rows[0].neededQty, 1);
  } finally {
    cleanup();
  }
});

test('non-singleton unacquired across two trips: neededQty sums', () => {
  const { db, cleanup } = openTestDb();
  try {
    const itemId = insertItem(db, { name: 'Energy gel', singleton: 0, acquired: 0 });
    const listA = insertList(db, 'Trip A');
    const catA = insertCategory(db, listA, 'Food');
    insertCi(db, catA, itemId, { qty: 6, acquired: 0 });
    const listB = insertList(db, 'Trip B');
    const catB = insertCategory(db, listB, 'Food');
    insertCi(db, catB, itemId, { qty: 4, acquired: 0 });

    const rows = buildToBuyList(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item.id, itemId);
    assert.equal(rows[0].item.singleton, false);
    assert.equal(rows[0].neededQty, 10);
  } finally {
    cleanup();
  }
});

test('non-singleton partially acquired: only unacquired rows contribute', () => {
  const { db, cleanup } = openTestDb();
  try {
    const itemId = insertItem(db, { name: 'Energy gel', singleton: 0 });
    const listA = insertList(db, 'Trip A');
    const catA = insertCategory(db, listA, 'Food');
    insertCi(db, catA, itemId, { qty: 6, acquired: 1 }); // acquired: excluded
    const listB = insertList(db, 'Trip B');
    const catB = insertCategory(db, listB, 'Food');
    insertCi(db, catB, itemId, { qty: 4, acquired: 0 }); // unacquired: included

    const rows = buildToBuyList(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].neededQty, 4);
  } finally {
    cleanup();
  }
});

test('items only in archived trips are excluded (singleton and non-singleton)', () => {
  const { db, cleanup } = openTestDb();
  try {
    const singletonId = insertItem(db, { name: 'Tent', singleton: 1, acquired: 0 });
    const multiId = insertItem(db, { name: 'Gel', singleton: 0 });
    const archivedList = insertList(db, 'Old trip', 1);
    const cat = insertCategory(db, archivedList, 'Everything');
    insertCi(db, cat, singletonId, { qty: 1 });
    insertCi(db, cat, multiId, { qty: 5, acquired: 0 });

    assert.deepEqual(buildToBuyList(db), []);
  } finally {
    cleanup();
  }
});

test('excluded rows (qty=0) do not count', () => {
  const { db, cleanup } = openTestDb();
  try {
    const singletonId = insertItem(db, { name: 'Tent', singleton: 1, acquired: 0 });
    const multiId = insertItem(db, { name: 'Gel', singleton: 0 });
    const listA = insertList(db, 'Trip A');
    const cat = insertCategory(db, listA, 'Everything');
    insertCi(db, cat, singletonId, { qty: 0 });
    insertCi(db, cat, multiId, { qty: 0, acquired: 0 });

    assert.deepEqual(buildToBuyList(db), []);
  } finally {
    cleanup();
  }
});

test('dedupes singleton appearing in multiple trips', () => {
  const { db, cleanup } = openTestDb();
  try {
    const itemId = insertItem(db, { name: 'Tent', singleton: 1, acquired: 0 });
    const listA = insertList(db, 'Trip A');
    const catA = insertCategory(db, listA, 'Shelter');
    insertCi(db, catA, itemId, { qty: 1 });
    const listB = insertList(db, 'Trip B');
    const catB = insertCategory(db, listB, 'Shelter');
    insertCi(db, catB, itemId, { qty: 1 });

    const rows = buildToBuyList(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item.id, itemId);
    assert.equal(rows[0].neededQty, 1);
  } finally {
    cleanup();
  }
});

test('results sorted by name case-insensitively', () => {
  const { db, cleanup } = openTestDb();
  try {
    const list = insertList(db, 'Trip');
    const cat = insertCategory(db, list, 'Misc');
    const zid = insertItem(db, { name: 'zebra mat', singleton: 1, acquired: 0 });
    const aid = insertItem(db, { name: 'Alpha stove', singleton: 1, acquired: 0 });
    const mid = insertItem(db, { name: 'beta pot', singleton: 1, acquired: 0 });
    insertCi(db, cat, zid, { qty: 1 });
    insertCi(db, cat, aid, { qty: 1 });
    insertCi(db, cat, mid, { qty: 1 });

    const rows = buildToBuyList(db);
    assert.deepEqual(rows.map((r) => r.item.name), ['Alpha stove', 'beta pot', 'zebra mat']);
  } finally {
    cleanup();
  }
});

test('acquireItem singleton: flips items.acquired only', () => {
  const { db, cleanup } = openTestDb();
  try {
    const itemId = insertItem(db, { name: 'Tent', singleton: 1, acquired: 0 });
    const list = insertList(db, 'Trip');
    const cat = insertCategory(db, list, 'Shelter');
    insertCi(db, cat, itemId, { qty: 1, acquired: 0 });

    const res = acquireItem(db, itemId);
    assert.equal(res.itemsAffected, 1);
    assert.equal(res.categoryItemsAffected, 0);

    const itemRow = db.prepare('SELECT acquired FROM items WHERE id = ?').get(itemId) as { acquired: number };
    assert.equal(itemRow.acquired, 1);
    const ciRow = db.prepare('SELECT acquired FROM category_items WHERE item_id = ?').get(itemId) as { acquired: number };
    assert.equal(ciRow.acquired, 0, 'ci row should be untouched for singleton');

    assert.deepEqual(buildToBuyList(db), []);
  } finally {
    cleanup();
  }
});

test('acquireItem non-singleton: flips category_items.acquired across non-archived trips only', () => {
  const { db, cleanup } = openTestDb();
  try {
    const itemId = insertItem(db, { name: 'Gel', singleton: 0 });
    const listA = insertList(db, 'Trip A');
    const catA = insertCategory(db, listA, 'Food');
    insertCi(db, catA, itemId, { qty: 3, acquired: 0 });
    const listB = insertList(db, 'Trip B');
    const catB = insertCategory(db, listB, 'Food');
    insertCi(db, catB, itemId, { qty: 2, acquired: 0 });
    const archivedList = insertList(db, 'Old trip', 1);
    const catArchived = insertCategory(db, archivedList, 'Food');
    insertCi(db, catArchived, itemId, { qty: 9, acquired: 0 });

    const res = acquireItem(db, itemId);
    assert.equal(res.itemsAffected, 0);
    assert.equal(res.categoryItemsAffected, 2, 'only the two non-archived ci rows should be flipped');

    const stillUnacquired = db.prepare(`
      SELECT COUNT(*) AS n FROM category_items WHERE item_id = ? AND acquired = 0
    `).get(itemId) as { n: number };
    assert.equal(stillUnacquired.n, 1, 'the archived row remains acquired=0');

    // items.acquired not touched
    const itemRow = db.prepare('SELECT acquired FROM items WHERE id = ?').get(itemId) as { acquired: number };
    assert.equal(itemRow.acquired, 0);

    assert.deepEqual(buildToBuyList(db), []);
  } finally {
    cleanup();
  }
});

test('acquireItem is idempotent', () => {
  const { db, cleanup } = openTestDb();
  try {
    const singletonId = insertItem(db, { name: 'Tent', singleton: 1, acquired: 0 });
    const listA = insertList(db, 'Trip');
    const catA = insertCategory(db, listA, 'Shelter');
    insertCi(db, catA, singletonId, { qty: 1 });

    const first = acquireItem(db, singletonId);
    assert.equal(first.itemsAffected, 1);
    // Second call is a safe no-op: the UPDATE still matches the row but
    // the resulting acquired=1 state is unchanged, and the to-buy list
    // remains empty.
    acquireItem(db, singletonId);
    const itemRow = db.prepare('SELECT acquired FROM items WHERE id = ?').get(singletonId) as { acquired: number };
    assert.equal(itemRow.acquired, 1);
    assert.deepEqual(buildToBuyList(db), []);

    const multiId = insertItem(db, { name: 'Gel', singleton: 0 });
    insertCi(db, catA, multiId, { qty: 4, acquired: 0 });
    const firstMulti = acquireItem(db, multiId);
    assert.equal(firstMulti.categoryItemsAffected, 1);
    acquireItem(db, multiId);
    const ciRow = db.prepare('SELECT acquired FROM category_items WHERE item_id = ?').get(multiId) as { acquired: number };
    assert.equal(ciRow.acquired, 1);
    assert.deepEqual(buildToBuyList(db), []);
  } finally {
    cleanup();
  }
});

test('acquireItem on missing id is a no-op', () => {
  const { db, cleanup } = openTestDb();
  try {
    const res = acquireItem(db, 99999);
    assert.deepEqual(res, { itemsAffected: 0, categoryItemsAffected: 0 });
  } finally {
    cleanup();
  }
});
