import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { db, getSetting } from './db.js';
import { resolvePrepStatus } from '../src/lib/prep.js';
import { buildToBuyList, acquireItem } from './prep-aggregator.js';

type ListRow = {
  id: number;
  name: string;
  description: string;
  external_id: string;
  position: number;
};

type CategoryRow = {
  id: number;
  list_id: number;
  name: string;
  color: string | null;
  position: number;
};

type CategoryItemRow = {
  category_id: number;
  item_id: number;
  position: number;
  qty: number;
  worn: number;
  consumable: number;
  star: number;
  priority: string | null;
  name: string;
  description: string;
  weight: number;
  author_unit: string;
  price: number;
  image: string;
  image_url: string;
  url: string;
  singleton: number;
  itemAcquired: number;
  itemWeighed: number;
  ciAcquired: number;
  ciWeighed: number;
  packed: number;
};

const app = new Hono();

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

app.get('/api/settings', (c) => {
  return c.json({
    version: getSetting('version'),
    totalUnit: getSetting('total_unit') ?? 'lb',
    itemUnit: getSetting('item_unit') ?? 'oz',
    currencySymbol: getSetting('currency_symbol') ?? '$',
    defaultListId: getSetting('default_list_id') ? Number(getSetting('default_list_id')) : null,
    optionalFields: JSON.parse(getSetting('optional_fields') ?? 'null'),
  });
});

app.get('/api/lists', (c) => {
  const includeArchived = c.req.query('includeArchived') === 'true';
  const sql = includeArchived
    ? 'SELECT id, name, description, external_id AS externalId, position, archived FROM lists ORDER BY position, id'
    : 'SELECT id, name, description, external_id AS externalId, position, archived FROM lists WHERE archived = 0 ORDER BY position, id';
  const rows = db.prepare(sql).all() as Array<ListRow & { externalId: string; archived: number }>;
  return c.json(rows.map((r) => ({ ...r, archived: !!r.archived })));
});

app.get('/api/lists/:id', (c) => {
  const id = Number(c.req.param('id'));
  const list = db.prepare('SELECT id, name, description, external_id AS externalId, position, archived FROM lists WHERE id = ?').get(id) as (ListRow & { externalId: string; archived: number }) | undefined;
  if (!list) return c.json({ error: 'not found' }, 404);
  list.archived = (list.archived ? 1 : 0) as any;

  const categories = db.prepare('SELECT id, list_id AS listId, name, color, position FROM categories WHERE list_id = ? ORDER BY position, id').all(id) as Array<CategoryRow & { listId: number }>;

  const items = db.prepare(`
    SELECT
      ci.category_id AS categoryId,
      ci.item_id AS itemId,
      ci.position,
      ci.qty,
      ci.worn,
      ci.consumable,
      ci.star,
      ci.priority,
      i.name,
      i.description,
      i.weight,
      i.author_unit AS authorUnit,
      i.price,
      i.image,
      i.image_url AS imageUrl,
      i.url,
      i.singleton,
      i.acquired AS itemAcquired,
      i.weighed AS itemWeighed,
      ci.acquired AS ciAcquired,
      ci.weighed AS ciWeighed,
      ci.packed
    FROM category_items ci
    JOIN items i ON i.id = ci.item_id
    WHERE ci.category_id IN (SELECT id FROM categories WHERE list_id = ?)
    ORDER BY ci.category_id, ci.position
  `).all(id) as Array<CategoryItemRow & { categoryId: number; itemId: number; authorUnit: string; imageUrl: string }>;

  const byCategory = new Map<number, typeof items>();
  for (const it of items) {
    const arr = byCategory.get(it.categoryId) ?? [];
    arr.push(it);
    byCategory.set(it.categoryId, arr);
  }

  return c.json({
    ...list,
    archived: !!list.archived,
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      color: cat.color ? JSON.parse(cat.color) : null,
      position: cat.position,
      items: (byCategory.get(cat.id) ?? []).map((it) => {
        const singleton = !!it.singleton;
        const itemAcquired = !!it.itemAcquired;
        const itemWeighed = !!it.itemWeighed;
        const ciAcquired = !!it.ciAcquired;
        const ciWeighed = !!it.ciWeighed;
        const packed = !!it.packed;
        const prep = resolvePrepStatus(
          { singleton, acquired: itemAcquired, weighed: itemWeighed },
          { acquired: ciAcquired, weighed: ciWeighed, packed },
        );
        return {
          itemId: it.itemId,
          name: it.name,
          description: it.description,
          weight: it.weight,
          authorUnit: it.authorUnit,
          price: it.price,
          image: it.image,
          imageUrl: it.imageUrl,
          url: it.url,
          singleton,
          qty: it.qty,
          worn: !!it.worn,
          consumable: !!it.consumable,
          star: it.star,
          position: it.position,
          priority: it.priority,
          itemAcquired,
          itemWeighed,
          ciAcquired,
          ciWeighed,
          packed,
          effective: prep.effective,
          writeTarget: prep.writeTarget,
        };
      }),
    })),
  });
});

app.get('/api/templates', (c) => {
  const rows = db.prepare(`
    SELECT
      t.id,
      t.slug,
      t.name,
      t.source,
      (SELECT COUNT(*) FROM template_categories tc WHERE tc.template_id = t.id) AS categoryCount,
      (SELECT COUNT(*) FROM template_items ti WHERE ti.template_category_id IN (SELECT id FROM template_categories WHERE template_id = t.id)) AS itemCount
    FROM templates t
    ORDER BY t.id
  `).all();
  return c.json(rows);
});

app.post('/api/lists/from-template', async (c) => {
  let body: { slug?: unknown; name?: unknown; itemIds?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const rawIds = Array.isArray(body.itemIds) ? body.itemIds : [];
  const itemIds = rawIds.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

  if (!slug) return c.json({ error: 'slug is required' }, 400);
  if (!name) return c.json({ error: 'name is required' }, 400);
  if (!itemIds.length) return c.json({ error: 'itemIds is required' }, 400);

  const tpl = db.prepare('SELECT id FROM templates WHERE slug = ?').get(slug) as { id: number } | undefined;
  if (!tpl) return c.json({ error: 'unknown template slug' }, 400);

  const placeholders = itemIds.map(() => '?').join(',');
  const selected = db.prepare(`
    SELECT
      ti.id AS templateItemId,
      ti.name AS itemName,
      ti.priority,
      ti.description,
      ti.position AS itemPosition,
      tc.id AS templateCategoryId,
      tc.name AS categoryName,
      tc.position AS categoryPosition
    FROM template_items ti
    JOIN template_categories tc ON tc.id = ti.template_category_id
    WHERE tc.template_id = ?
      AND ti.id IN (${placeholders})
    ORDER BY tc.position, tc.id, ti.position, ti.id
  `).all(tpl.id, ...itemIds) as Array<{
    templateItemId: number;
    itemName: string;
    priority: string;
    description: string;
    itemPosition: number;
    templateCategoryId: number;
    categoryName: string;
    categoryPosition: number;
  }>;

  if (!selected.length) return c.json({ error: 'no matching template items' }, 400);

  const tx = db.transaction(() => {
    const maxRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM lists').get() as { maxId: number };
    const newListId = maxRow.maxId + 1;
    db.prepare('INSERT INTO lists (id, name, description, external_id, position) VALUES (?, ?, ?, ?, ?)').run(newListId, name, '', '', 0);

    const insertCategory = db.prepare('INSERT INTO categories (list_id, name, color, position) VALUES (?, ?, NULL, ?)');
    const findItem = db.prepare('SELECT id FROM items WHERE LOWER(name) = LOWER(?) LIMIT 1');
    const insertItem = db.prepare('INSERT INTO items (name, description, weight, author_unit, price, image, image_url, url) VALUES (?, ?, 0, \'oz\', 0, \'\', \'\', \'\')');
    // Template items currently carry no weight data, so weighed defaults to 0.
    // acquired/packed are 0: the user hasn't acquired the suggested gear yet.
    const insertCategoryItem = db.prepare('INSERT INTO category_items (category_id, item_id, position, qty, worn, consumable, star, priority, acquired, weighed, packed) VALUES (?, ?, ?, 1, 0, 0, 0, ?, 0, 0, 0)');

    const categoriesByTplId = new Map<number, { newCategoryId: number; counter: number }>();
    const itemIdByLowerName = new Map<string, number>();

    for (const sel of selected) {
      let cat = categoriesByTplId.get(sel.templateCategoryId);
      if (!cat) {
        const newCategoryId = insertCategory.run(newListId, sel.categoryName, categoriesByTplId.size).lastInsertRowid as number;
        cat = { newCategoryId, counter: 0 };
        categoriesByTplId.set(sel.templateCategoryId, cat);
      }

      const lowerName = sel.itemName.toLowerCase();
      let itemId = itemIdByLowerName.get(lowerName) ?? 0;
      if (!itemId) {
        const existing = findItem.get(sel.itemName) as { id: number } | undefined;
        if (existing) {
          itemId = existing.id;
        } else {
          itemId = insertItem.run(sel.itemName, sel.description).lastInsertRowid as number;
        }
        itemIdByLowerName.set(lowerName, itemId);
      }

      try {
        insertCategoryItem.run(cat.newCategoryId, itemId, cat.counter, sel.priority);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('UNIQUE')) {
          // Same library item already linked to this category — skip duplicate.
          continue;
        }
        throw e;
      }
      cat.counter += 1;
    }

    return newListId;
  });

  try {
    const newId = tx();
    return c.json({ id: newId, name });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.get('/api/templates/:slug', (c) => {
  const slug = c.req.param('slug');
  const tpl = db.prepare('SELECT id, slug, name, source FROM templates WHERE slug = ?').get(slug) as { id: number; slug: string; name: string; source: string | null } | undefined;
  if (!tpl) return c.json({ error: 'not found' }, 404);

  const categories = db.prepare('SELECT id, name, position FROM template_categories WHERE template_id = ? ORDER BY position, id').all(tpl.id) as Array<{ id: number; name: string; position: number }>;
  const items = db.prepare('SELECT id, template_category_id AS categoryId, name, priority, description, example, more_info AS moreInfo, position FROM template_items WHERE template_category_id IN (SELECT id FROM template_categories WHERE template_id = ?) ORDER BY template_category_id, position').all(tpl.id) as Array<{ id: number; categoryId: number; name: string; priority: string; description: string; example: string; moreInfo: string; position: number }>;

  const byCategory = new Map<number, typeof items>();
  for (const it of items) {
    const arr = byCategory.get(it.categoryId) ?? [];
    arr.push(it);
    byCategory.set(it.categoryId, arr);
  }

  return c.json({
    id: tpl.id,
    slug: tpl.slug,
    name: tpl.name,
    source: tpl.source,
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      position: cat.position,
      items: byCategory.get(cat.id) ?? [],
    })),
  });
});

// ───── Edit primitives (Batch A) ─────

function badRequest(c: any, msg: string) { return c.json({ error: msg }, 400); }
function notFound(c: any, msg = 'not found') { return c.json({ error: msg }, 404); }

async function readJson(c: any): Promise<any | null> {
  try { return await c.req.json(); } catch { return null; }
}

app.put('/api/lists/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(id);
  if (!list) return notFound(c);

  const sets: string[] = [];
  const args: unknown[] = [];
  if (typeof body.name === 'string') { sets.push('name = ?'); args.push(body.name); }
  if (typeof body.description === 'string') { sets.push('description = ?'); args.push(body.description); }
  if (sets.length) {
    args.push(id);
    db.prepare(`UPDATE lists SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  }
  const row = db.prepare('SELECT id, name, description, external_id AS externalId, position FROM lists WHERE id = ?').get(id);
  return c.json(row);
});

app.post('/api/lists', async (c) => {
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return badRequest(c, 'name is required');
  const description = typeof body.description === 'string' ? body.description : '';

  const maxRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM lists').get() as { maxId: number };
  const newListId = maxRow.maxId + 1;
  db.prepare('INSERT INTO lists (id, name, description, external_id, position) VALUES (?, ?, ?, ?, ?)').run(newListId, name, description, '', 0);

  const row = db.prepare('SELECT id, name, description, external_id AS externalId, position FROM lists WHERE id = ?').get(newListId);
  return c.json(row);
});

app.post('/api/categories', async (c) => {
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const listId = Number(body.listId);
  const name = typeof body.name === 'string' ? body.name : '';
  if (!Number.isFinite(listId)) return badRequest(c, 'listId required');
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(listId);
  if (!list) return notFound(c, 'list not found');

  const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM categories WHERE list_id = ?').get(listId) as { maxPos: number };
  const pos = max.maxPos + 1;
  const result = db.prepare('INSERT INTO categories (list_id, name, position) VALUES (?, ?, ?)').run(listId, name, pos);
  return c.json({ id: result.lastInsertRowid, listId, name, position: pos });
});

app.put('/api/categories/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const cat = db.prepare('SELECT id, list_id AS listId, name, position FROM categories WHERE id = ?').get(id);
  if (!cat) return notFound(c);
  if (typeof body.name === 'string') {
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(body.name, id);
  }
  return c.json(db.prepare('SELECT id, list_id AS listId, name, position FROM categories WHERE id = ?').get(id));
});

app.delete('/api/categories/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!cat) return notFound(c);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return c.json({ ok: true });
});

const ITEM_FIELDS: Record<string, string> = {
  name: 'name',
  description: 'description',
  weight: 'weight',
  authorUnit: 'author_unit',
  price: 'price',
  url: 'url',
  imageUrl: 'image_url',
  image: 'image',
  singleton: 'singleton',
  acquired: 'acquired',
  weighed: 'weighed',
};

const ITEM_BOOLEAN_FIELDS = new Set(['singleton', 'acquired', 'weighed']);

function rowItem(id: number) {
  const row = db.prepare('SELECT id, name, description, weight, author_unit AS authorUnit, price, image, image_url AS imageUrl, url, singleton, acquired, weighed FROM items WHERE id = ?').get(id) as any;
  if (!row) return null;
  return { ...row, singleton: !!row.singleton, acquired: !!row.acquired, weighed: !!row.weighed };
}

app.post('/api/items', async (c) => {
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const name = typeof body.name === 'string' ? body.name : '';
  const description = typeof body.description === 'string' ? body.description : '';
  const weight = Number.isFinite(Number(body.weight)) ? Number(body.weight) : 0;
  const authorUnit = typeof body.authorUnit === 'string' ? body.authorUnit : 'oz';
  const price = Number.isFinite(Number(body.price)) ? Number(body.price) : 0;
  const url = typeof body.url === 'string' ? body.url : '';
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : '';
  const singleton = body.singleton === false ? 0 : 1;
  const result = db.prepare('INSERT INTO items (name, description, weight, author_unit, price, image, image_url, url, singleton) VALUES (?, ?, ?, ?, ?, \'\', ?, ?, ?)').run(name, description, weight, authorUnit, price, imageUrl, url, singleton);
  return c.json(rowItem(result.lastInsertRowid as number));
});

app.put('/api/items/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const exists = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!exists) return notFound(c);

  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [key, col] of Object.entries(ITEM_FIELDS)) {
    if (!(key in body)) continue;
    const v = (body as any)[key];
    if (key === 'weight' || key === 'price') {
      const n = Number(v);
      if (!Number.isFinite(n)) return badRequest(c, `${key} must be a number`);
      sets.push(`${col} = ?`); args.push(n);
    } else if (ITEM_BOOLEAN_FIELDS.has(key)) {
      sets.push(`${col} = ?`); args.push(v ? 1 : 0);
    } else {
      sets.push(`${col} = ?`); args.push(v == null ? '' : String(v));
    }
  }
  if (sets.length) {
    args.push(id);
    db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  }
  return c.json(rowItem(id));
});

app.get('/api/items', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q) {
    const rows = db.prepare('SELECT id, name, description, weight, author_unit AS authorUnit, price, image, image_url AS imageUrl, url, singleton, acquired, weighed FROM items WHERE LOWER(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 50').all(`%${q.toLowerCase()}%`) as any[];
    return c.json(rows.map((r) => ({ ...r, singleton: !!r.singleton, acquired: !!r.acquired, weighed: !!r.weighed })));
  }
  const rows = db.prepare('SELECT id, name, description, weight, author_unit AS authorUnit, price, image, image_url AS imageUrl, url, singleton, acquired, weighed FROM items ORDER BY name COLLATE NOCASE LIMIT 50').all() as any[];
  return c.json(rows.map((r) => ({ ...r, singleton: !!r.singleton, acquired: !!r.acquired, weighed: !!r.weighed })));
});

function joinedCategoryItem(categoryId: number, itemId: number) {
  return db.prepare(`
    SELECT
      ci.category_id AS categoryId,
      ci.item_id AS itemId,
      ci.position,
      ci.qty,
      ci.worn,
      ci.consumable,
      ci.star,
      ci.priority,
      i.name,
      i.description,
      i.weight,
      i.author_unit AS authorUnit,
      i.price,
      i.image,
      i.image_url AS imageUrl,
      i.url,
      i.singleton,
      i.acquired AS itemAcquired,
      i.weighed AS itemWeighed,
      ci.acquired AS ciAcquired,
      ci.weighed AS ciWeighed,
      ci.packed
    FROM category_items ci JOIN items i ON i.id = ci.item_id
    WHERE ci.category_id = ? AND ci.item_id = ?
  `).get(categoryId, itemId) as any;
}

function shapeCategoryItem(row: any) {
  if (!row) return null;
  const singleton = !!row.singleton;
  const itemAcquired = !!row.itemAcquired;
  const itemWeighed = !!row.itemWeighed;
  const ciAcquired = !!row.ciAcquired;
  const ciWeighed = !!row.ciWeighed;
  const packed = !!row.packed;
  const prep = resolvePrepStatus(
    { singleton, acquired: itemAcquired, weighed: itemWeighed },
    { acquired: ciAcquired, weighed: ciWeighed, packed },
  );
  return {
    itemId: row.itemId,
    name: row.name,
    description: row.description,
    weight: row.weight,
    authorUnit: row.authorUnit,
    price: row.price,
    image: row.image,
    imageUrl: row.imageUrl,
    url: row.url,
    singleton,
    qty: row.qty,
    worn: !!row.worn,
    consumable: !!row.consumable,
    star: row.star,
    position: row.position,
    priority: row.priority,
    itemAcquired,
    itemWeighed,
    ciAcquired,
    ciWeighed,
    packed,
    effective: prep.effective,
    writeTarget: prep.writeTarget,
  };
}

app.post('/api/category_items', async (c) => {
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const categoryId = Number(body.categoryId);
  const itemId = Number(body.itemId);
  if (!Number.isFinite(categoryId) || !Number.isFinite(itemId)) return badRequest(c, 'categoryId and itemId required');
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!cat) return notFound(c, 'category not found');
  const it = db.prepare('SELECT id FROM items WHERE id = ?').get(itemId);
  if (!it) return notFound(c, 'item not found');
  const dup = db.prepare('SELECT 1 FROM category_items WHERE category_id = ? AND item_id = ?').get(categoryId, itemId);
  if (dup) return c.json({ error: 'item already linked to category' }, 409);

  const qty = Number.isFinite(Number(body.qty)) ? Number(body.qty) : 1;
  const worn = body.worn ? 1 : 0;
  const consumable = body.consumable ? 1 : 0;
  const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM category_items WHERE category_id = ?').get(categoryId) as { maxPos: number };
  const pos = max.maxPos + 1;
  db.prepare('INSERT INTO category_items (category_id, item_id, position, qty, worn, consumable, star, priority) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)').run(categoryId, itemId, pos, qty, worn, consumable);
  return c.json(shapeCategoryItem(joinedCategoryItem(categoryId, itemId)));
});

app.put('/api/category_items/:categoryId/:itemId', async (c) => {
  const categoryId = Number(c.req.param('categoryId'));
  const itemId = Number(c.req.param('itemId'));
  if (!Number.isFinite(categoryId) || !Number.isFinite(itemId)) return badRequest(c, 'invalid ids');
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const ci = db.prepare('SELECT 1 FROM category_items WHERE category_id = ? AND item_id = ?').get(categoryId, itemId);
  if (!ci) return notFound(c);

  const sets: string[] = [];
  const args: unknown[] = [];
  if ('qty' in body) { const n = Number(body.qty); if (!Number.isFinite(n)) return badRequest(c, 'qty must be a number'); sets.push('qty = ?'); args.push(n); }
  if ('worn' in body) { sets.push('worn = ?'); args.push(body.worn ? 1 : 0); }
  if ('consumable' in body) { sets.push('consumable = ?'); args.push(body.consumable ? 1 : 0); }
  if ('star' in body) { sets.push('star = ?'); args.push(body.star ? 1 : 0); }
  if ('acquired' in body) { sets.push('acquired = ?'); args.push(body.acquired ? 1 : 0); }
  if ('weighed' in body) { sets.push('weighed = ?'); args.push(body.weighed ? 1 : 0); }
  if ('packed' in body) { sets.push('packed = ?'); args.push(body.packed ? 1 : 0); }
  if (sets.length) {
    args.push(categoryId, itemId);
    db.prepare(`UPDATE category_items SET ${sets.join(', ')} WHERE category_id = ? AND item_id = ?`).run(...args);
  }
  return c.json(shapeCategoryItem(joinedCategoryItem(categoryId, itemId)));
});

// ───── Item library (Batch C) ─────

app.get('/api/items/all', (c) => {
  const rows = db.prepare(`
    SELECT
      i.id, i.name, i.description, i.weight,
      i.author_unit AS authorUnit, i.price,
      i.image, i.image_url AS imageUrl, i.url, i.singleton,
      i.acquired, i.weighed,
      COUNT(ci.item_id) AS usedIn
    FROM items i
    LEFT JOIN category_items ci ON ci.item_id = i.id
    GROUP BY i.id
    ORDER BY i.name COLLATE NOCASE
  `).all() as any[];
  return c.json(rows.map((r) => ({ ...r, singleton: !!r.singleton, acquired: !!r.acquired, weighed: !!r.weighed })));
});

app.get('/api/to-buy', (c) => {
  return c.json(buildToBuyList(db));
});

app.post('/api/to-buy/acquire', async (c) => {
  const body = await readJson(c);
  if (!body || typeof body !== 'object') return badRequest(c, 'invalid json');
  const itemId = Number(body.itemId);
  if (!Number.isFinite(itemId)) return badRequest(c, 'itemId required');
  const result = acquireItem(db, itemId);
  return c.json(result);
});

app.get('/api/items/:id/usage', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const exists = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!exists) return notFound(c);
  const rows = db.prepare(`
    SELECT
      l.id AS listId, l.name AS listName,
      c.id AS categoryId, c.name AS categoryName,
      ci.qty, ci.worn, ci.consumable
    FROM category_items ci
    JOIN categories c ON c.id = ci.category_id
    JOIN lists l ON l.id = c.list_id
    WHERE ci.item_id = ?
    ORDER BY l.id DESC, c.position
  `).all(id) as any[];
  return c.json(rows.map((r) => ({ ...r, worn: !!r.worn, consumable: !!r.consumable })));
});

app.delete('/api/items/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const exists = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!exists) return notFound(c);
  const usedIn = db.prepare(`
    SELECT
      l.id AS listId, l.name AS listName,
      c.id AS categoryId, c.name AS categoryName
    FROM category_items ci
    JOIN categories c ON c.id = ci.category_id
    JOIN lists l ON l.id = c.list_id
    WHERE ci.item_id = ?
    ORDER BY l.id DESC, c.position
  `).all(id);
  if (usedIn.length) return c.json({ error: 'item is referenced', usedIn }, 409);
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return c.json({ ok: true });
});

// ───── Reorder & lifecycle (Batch B) ─────

app.put('/api/lists/:id/category-order', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const body = await readJson(c);
  if (!body || !Array.isArray(body.categoryIds)) return badRequest(c, 'categoryIds required');
  const ids = (body.categoryIds as unknown[]).map(Number);
  if (ids.some((n) => !Number.isFinite(n))) return badRequest(c, 'invalid id in array');
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(id);
  if (!list) return notFound(c);

  const own = db.prepare('SELECT id FROM categories WHERE list_id = ?').all(id) as Array<{ id: number }>;
  const ownSet = new Set(own.map((r) => r.id));
  if (ids.length !== ownSet.size || ids.some((n) => !ownSet.has(n))) return badRequest(c, 'categoryIds must match list categories');

  const update = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
  db.transaction(() => {
    ids.forEach((cid, i) => update.run(i, cid));
  })();
  return c.json({ ok: true });
});

app.put('/api/categories/:id/item-order', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const body = await readJson(c);
  if (!body || !Array.isArray(body.itemIds)) return badRequest(c, 'itemIds required');
  const ids = (body.itemIds as unknown[]).map(Number);
  if (ids.some((n) => !Number.isFinite(n))) return badRequest(c, 'invalid id in array');
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!cat) return notFound(c);

  const own = db.prepare('SELECT item_id AS itemId FROM category_items WHERE category_id = ?').all(id) as Array<{ itemId: number }>;
  const ownSet = new Set(own.map((r) => r.itemId));
  if (ids.length !== ownSet.size || ids.some((n) => !ownSet.has(n))) return badRequest(c, 'itemIds must match category items');

  const update = db.prepare('UPDATE category_items SET position = ? WHERE category_id = ? AND item_id = ?');
  db.transaction(() => {
    ids.forEach((iid, i) => update.run(i, id, iid));
  })();
  return c.json({ ok: true });
});

app.post('/api/lists/:id/clone', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const body = await readJson(c) ?? {};
  const src = db.prepare('SELECT id, name, description FROM lists WHERE id = ?').get(id) as { id: number; name: string; description: string } | undefined;
  if (!src) return notFound(c);
  const cloneName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `Copy of ${src.name || `#${src.id}`}`;

  const newId = db.transaction(() => {
    const maxRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM lists').get() as { maxId: number };
    const newListId = maxRow.maxId + 1;
    db.prepare('INSERT INTO lists (id, name, description, external_id, position, archived) VALUES (?, ?, ?, \'\', 0, 0)').run(newListId, cloneName, src.description);

    const cats = db.prepare('SELECT id, name, color, position FROM categories WHERE list_id = ? ORDER BY position, id').all(id) as Array<{ id: number; name: string; color: string | null; position: number }>;
    const insCat = db.prepare('INSERT INTO categories (list_id, name, color, position) VALUES (?, ?, ?, ?)');
    // Clone always resets prep flags on the new list's category_items rows:
    // packed=0 always; acquired=0/weighed=0 regardless of singleton (for
    // singleton items those ci fields are not authoritative, so writing 0
    // is just tidy). Library-level items.{acquired,weighed} is untouched.
    const insCi = db.prepare('INSERT INTO category_items (category_id, item_id, position, qty, worn, consumable, star, priority, acquired, weighed, packed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)');
    for (const cat of cats) {
      const newCatId = insCat.run(newListId, cat.name, cat.color, cat.position).lastInsertRowid as number;
      const items = db.prepare('SELECT item_id AS itemId, position, qty, worn, consumable, star, priority FROM category_items WHERE category_id = ? ORDER BY position').all(cat.id) as Array<{ itemId: number; position: number; qty: number; worn: number; consumable: number; star: number; priority: string | null }>;
      for (const it of items) {
        insCi.run(newCatId, it.itemId, it.position, it.qty, it.worn, it.consumable, it.star, it.priority);
      }
    }
    return newListId;
  })();

  const summary = db.prepare('SELECT id, name, description, external_id AS externalId, position, archived FROM lists WHERE id = ?').get(newId) as any;
  return c.json({ ...summary, archived: !!summary.archived });
});

app.delete('/api/lists/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(id);
  if (!list) return notFound(c);
  db.transaction(() => {
    db.prepare('DELETE FROM category_items WHERE category_id IN (SELECT id FROM categories WHERE list_id = ?)').run(id);
    db.prepare('DELETE FROM categories WHERE list_id = ?').run(id);
    db.prepare('DELETE FROM lists WHERE id = ?').run(id);
  })();
  return c.json({ ok: true });
});

app.put('/api/lists/:id/archived', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest(c, 'invalid id');
  const body = await readJson(c);
  if (!body || typeof body.archived !== 'boolean') return badRequest(c, 'archived (boolean) required');
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(id);
  if (!list) return notFound(c);
  db.prepare('UPDATE lists SET archived = ? WHERE id = ?').run(body.archived ? 1 : 0, id);
  const row = db.prepare('SELECT id, name, description, external_id AS externalId, position, archived FROM lists WHERE id = ?').get(id) as any;
  return c.json({ ...row, archived: !!row.archived });
});

app.delete('/api/category_items/:categoryId/:itemId', (c) => {
  const categoryId = Number(c.req.param('categoryId'));
  const itemId = Number(c.req.param('itemId'));
  if (!Number.isFinite(categoryId) || !Number.isFinite(itemId)) return badRequest(c, 'invalid ids');
  const ci = db.prepare('SELECT 1 FROM category_items WHERE category_id = ? AND item_id = ?').get(categoryId, itemId);
  if (!ci) return notFound(c);
  db.prepare('DELETE FROM category_items WHERE category_id = ? AND item_id = ?').run(categoryId, itemId);
  return c.json({ ok: true });
});

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api')) return c.notFound();
    try {
      const html = await readFile('./dist/index.html', 'utf-8');
      return c.html(html);
    } catch {
      return c.notFound();
    }
  });
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`hiking-gear api listening on http://localhost:${info.port}`);
});
