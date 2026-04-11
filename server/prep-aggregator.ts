import type Database from 'better-sqlite3';

type DatabaseInstance = Database.Database;

export type ToBuyItem = {
  id: number;
  name: string;
  description: string;
  weight: number;
  authorUnit: string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
  singleton: boolean;
  acquired: boolean;
  weighed: boolean;
};

export type ToBuyRow = {
  item: ToBuyItem;
  neededQty: number;
};

type RawRow = {
  id: number;
  name: string;
  description: string;
  weight: number;
  authorUnit: string;
  price: number;
  image: string;
  imageUrl: string;
  url: string;
  singleton: number;
  acquired: number;
  weighed: number;
  neededQty: number;
};

const SINGLETON_SQL = `
  SELECT i.id, i.name, i.description, i.weight,
         i.author_unit AS authorUnit, i.price,
         i.image, i.image_url AS imageUrl, i.url,
         i.singleton, i.acquired, i.weighed,
         1 AS neededQty
  FROM items i
  WHERE i.singleton = 1
    AND i.acquired = 0
    AND EXISTS (
      SELECT 1
      FROM category_items ci
      JOIN categories c ON c.id = ci.category_id
      JOIN lists l ON l.id = c.list_id
      WHERE ci.item_id = i.id
        AND ci.qty > 0
        AND l.archived = 0
    )
`;

const NON_SINGLETON_SQL = `
  SELECT i.id, i.name, i.description, i.weight,
         i.author_unit AS authorUnit, i.price,
         i.image, i.image_url AS imageUrl, i.url,
         i.singleton, i.acquired, i.weighed,
         SUM(ci.qty) AS neededQty
  FROM items i
  JOIN category_items ci ON ci.item_id = i.id
  JOIN categories c ON c.id = ci.category_id
  JOIN lists l ON l.id = c.list_id
  WHERE i.singleton = 0
    AND ci.acquired = 0
    AND ci.qty > 0
    AND l.archived = 0
  GROUP BY i.id
`;

export function buildToBuyList(database: DatabaseInstance): ToBuyRow[] {
  const sql = `
    ${SINGLETON_SQL}
    UNION ALL
    ${NON_SINGLETON_SQL}
    ORDER BY name COLLATE NOCASE
  `;
  const rows = database.prepare(sql).all() as RawRow[];
  return rows.map((r) => ({
    item: {
      id: r.id,
      name: r.name,
      description: r.description,
      weight: r.weight,
      authorUnit: r.authorUnit,
      price: r.price,
      image: r.image,
      imageUrl: r.imageUrl,
      url: r.url,
      singleton: !!r.singleton,
      acquired: !!r.acquired,
      weighed: !!r.weighed,
    },
    neededQty: Number(r.neededQty) || 0,
  }));
}

export type AcquireResult = {
  itemsAffected: number;
  categoryItemsAffected: number;
};

export function acquireItem(database: DatabaseInstance, itemId: number): AcquireResult {
  const row = database.prepare('SELECT singleton FROM items WHERE id = ?').get(itemId) as { singleton: number } | undefined;
  if (!row) return { itemsAffected: 0, categoryItemsAffected: 0 };
  if (row.singleton) {
    const r = database.prepare('UPDATE items SET acquired = 1 WHERE id = ?').run(itemId);
    return { itemsAffected: r.changes, categoryItemsAffected: 0 };
  }
  const r = database.prepare(`
    UPDATE category_items
       SET acquired = 1
     WHERE item_id = ?
       AND category_id IN (
         SELECT id FROM categories
          WHERE list_id IN (SELECT id FROM lists WHERE archived = 0)
       )
  `).run(itemId);
  return { itemsAffected: 0, categoryItemsAffected: r.changes };
}
