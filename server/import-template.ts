import { readFileSync } from 'node:fs';
import { db } from './db.js';

const TEMPLATE_PATH = 'reference/template/3-season.csv';
const TEMPLATE_SLUG = '3-season';
const TEMPLATE_NAME = '3-Season Backpacking';

const VALID_PRIORITIES = new Set(['Critical', 'Contingent', 'Suggested', 'Optional', 'Unnecessary']);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // skip
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isCategoryHeaderRow(row: string[]): boolean {
  const a = (row[0] ?? '').trim();
  if (!a) return false;
  if (a === row[5]?.trim()) return true; // col F mirrors col A on category rows
  return false;
}

function main() {
  const text = readFileSync(TEMPLATE_PATH, 'utf8');
  const rows = parseCsv(text);

  if (!rows.length) throw new Error('Template CSV is empty');

  // header row: Item,Priority,Description or Purpose,Example,More Info,...
  const header = rows[0].map((h) => h.trim());
  const col = {
    item: header.indexOf('Item'),
    priority: header.indexOf('Priority'),
    description: header.indexOf('Description or Purpose'),
    example: header.indexOf('Example'),
    moreInfo: header.indexOf('More Info'),
  };
  if (col.item !== 0 || col.priority < 0) {
    throw new Error(`Unexpected template header: ${JSON.stringify(header.slice(0, 6))}`);
  }

  type Parsed = {
    categoryName: string;
    items: Array<{ name: string; priority: string; description: string; example: string; moreInfo: string }>;
  };
  const seen = new Map<string, Parsed>();
  const order: string[] = [];
  let currentCategory: Parsed | null = null;
  let seenCategories = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const first = (row[col.item] ?? '').trim();
    if (!first) {
      currentCategory = null;
      continue;
    }
    if (first.toUpperCase() === 'TOTAL' || first === 'Weight Totals' || first === 'Specify weight unit:') {
      currentCategory = null;
      continue;
    }
    if (isCategoryHeaderRow(row)) {
      if (seenCategories.has(first)) {
        currentCategory = null;
        continue;
      }
      seenCategories.add(first);
      currentCategory = { categoryName: first, items: [] };
      seen.set(first, currentCategory);
      order.push(first);
      continue;
    }
    if (!currentCategory) continue;

    const priority = (row[col.priority] ?? '').trim();
    if (!priority || !VALID_PRIORITIES.has(priority)) continue;

    currentCategory.items.push({
      name: first,
      priority,
      description: (row[col.description] ?? '').trim(),
      example: (row[col.example] ?? '').trim(),
      moreInfo: (row[col.moreInfo] ?? '').trim(),
    });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM template_items WHERE template_category_id IN (SELECT id FROM template_categories WHERE template_id IN (SELECT id FROM templates WHERE slug = ?))').run(TEMPLATE_SLUG);
    db.prepare('DELETE FROM template_categories WHERE template_id IN (SELECT id FROM templates WHERE slug = ?)').run(TEMPLATE_SLUG);
    db.prepare('DELETE FROM templates WHERE slug = ?').run(TEMPLATE_SLUG);

    const templateId = db.prepare('INSERT INTO templates (slug, name, source) VALUES (?, ?, ?)').run(
      TEMPLATE_SLUG,
      TEMPLATE_NAME,
      'https://docs.google.com/spreadsheets/d/1TyDqp5jGdyR12nx_CS0iLGfM2cfh6tmaSBxkJYMg8To',
    ).lastInsertRowid as number;

    const insertCat = db.prepare('INSERT INTO template_categories (template_id, name, position) VALUES (?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO template_items (template_category_id, name, priority, description, example, more_info, position) VALUES (?, ?, ?, ?, ?, ?, ?)');

    order.forEach((name, pos) => {
      const cat = seen.get(name)!;
      const catId = insertCat.run(templateId, name, pos).lastInsertRowid as number;
      cat.items.forEach((item, itemPos) => {
        insertItem.run(catId, item.name, item.priority, item.description, item.example, item.moreInfo, itemPos);
      });
    });
  });

  tx();

  const catCount = (db.prepare('SELECT COUNT(*) AS n FROM template_categories').get() as { n: number }).n;
  const itemCount = (db.prepare('SELECT COUNT(*) AS n FROM template_items').get() as { n: number }).n;
  console.log(`Imported template "${TEMPLATE_NAME}": ${catCount} categories, ${itemCount} items`);

  const breakdown = db.prepare(`
    SELECT tc.name AS category, COUNT(ti.id) AS items
    FROM template_categories tc
    LEFT JOIN template_items ti ON ti.template_category_id = tc.id
    GROUP BY tc.id
    ORDER BY tc.position
  `).all() as Array<{ category: string; items: number }>;
  for (const row of breakdown) {
    console.log(`  ${row.category}: ${row.items}`);
  }
}

main();
