import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, setSetting } from './db.js';

const EXPORT_ROOT = 'data/lighterpack';

function latestExportDir(): string {
  const entries = readdirSync(EXPORT_ROOT).filter((e) => !e.startsWith('.'));
  if (!entries.length) throw new Error(`No exports found in ${EXPORT_ROOT}. Run npm run export first.`);
  entries.sort();
  return join(EXPORT_ROOT, entries[entries.length - 1]);
}

type RawItem = {
  id: number;
  name?: string;
  description?: string;
  weight?: number;
  authorUnit?: string;
  price?: number | string;
  image?: string;
  imageUrl?: string;
  url?: string;
};

type RawCategoryItem = {
  itemId: number;
  qty?: number;
  worn?: number | boolean;
  consumable?: number | boolean;
  star?: number;
};

type RawCategory = {
  id: number;
  name?: string;
  color?: unknown;
  categoryItems?: RawCategoryItem[];
};

type RawList = {
  id: number;
  name?: string;
  description?: string;
  externalId?: string;
  categoryIds?: (number | string)[];
};

type RawLibrary = {
  version?: string;
  totalUnit?: string;
  itemUnit?: string;
  defaultListId?: number;
  sequence?: number;
  currencySymbol?: string;
  optionalFields?: unknown;
  items?: RawItem[];
  categories?: RawCategory[];
  lists?: RawList[];
};

function main() {
  const dir = latestExportDir();
  console.log(`Importing from ${dir}`);

  const library: RawLibrary = JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'));

  const items = library.items ?? [];
  const categories = library.categories ?? [];
  const lists = library.lists ?? [];

  const upsertItem = db.prepare(`
    INSERT INTO items (id, name, description, weight, author_unit, price, image, image_url, url)
    VALUES (@id, @name, @description, @weight, @author_unit, @price, @image, @image_url, @url)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      weight = excluded.weight,
      author_unit = excluded.author_unit,
      price = excluded.price,
      image = excluded.image,
      image_url = excluded.image_url,
      url = excluded.url
  `);

  const insertList = db.prepare(`
    INSERT INTO lists (id, name, description, external_id, position)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertCategory = db.prepare(`
    INSERT INTO categories (id, list_id, name, color, position)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertCategoryItem = db.prepare(`
    INSERT INTO category_items (category_id, item_id, position, qty, worn, consumable, star)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    db.exec('DELETE FROM category_items; DELETE FROM categories; DELETE FROM lists;');

    for (const item of items) {
      upsertItem.run({
        id: item.id,
        name: item.name ?? '',
        description: item.description ?? '',
        weight: Number(item.weight ?? 0),
        author_unit: item.authorUnit ?? 'oz',
        price: typeof item.price === 'string' ? parseFloat(item.price) : (item.price ?? 0),
        image: item.image ?? '',
        image_url: item.imageUrl ?? '',
        url: item.url ?? '',
      });
    }

    const categoriesById = new Map<number, RawCategory>();
    for (const c of categories) categoriesById.set(c.id, c);

    lists.forEach((list, listPos) => {
      insertList.run(list.id, list.name ?? '', list.description ?? '', list.externalId ?? '', listPos);

      const categoryIds = (list.categoryIds ?? []).map((c) => Number(c));
      categoryIds.forEach((categoryId, catPos) => {
        const cat = categoriesById.get(categoryId);
        if (!cat) {
          console.warn(`  list ${list.id}: missing category ${categoryId}`);
          return;
        }
        const color = cat.color != null ? JSON.stringify(cat.color) : null;
        insertCategory.run(cat.id, list.id, cat.name ?? '', color, catPos);

        (cat.categoryItems ?? []).forEach((ci, itemPos) => {
          insertCategoryItem.run(
            cat.id,
            ci.itemId,
            itemPos,
            Number(ci.qty ?? 1),
            ci.worn ? 1 : 0,
            ci.consumable ? 1 : 0,
            Number(ci.star ?? 0),
          );
        });
      });
    });

    setSetting('version', String(library.version ?? '0.3'));
    setSetting('total_unit', String(library.totalUnit ?? 'lb'));
    setSetting('item_unit', String(library.itemUnit ?? 'oz'));
    setSetting('currency_symbol', String(library.currencySymbol ?? '$'));
    if (library.defaultListId != null) setSetting('default_list_id', String(library.defaultListId));
    if (library.optionalFields) setSetting('optional_fields', JSON.stringify(library.optionalFields));
  });

  tx();

  const counts = {
    items: (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n,
    lists: (db.prepare('SELECT COUNT(*) AS n FROM lists').get() as { n: number }).n,
    categories: (db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }).n,
    category_items: (db.prepare('SELECT COUNT(*) AS n FROM category_items').get() as { n: number }).n,
  };
  console.log('Imported:', counts);
}

main();
