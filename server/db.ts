import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || 'data/hiking-gear.db';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 0,
    author_unit TEXT NOT NULL DEFAULT 'oz',
    price REAL NOT NULL DEFAULT 0,
    image TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    external_id TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    color TEXT,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_categories_list ON categories(list_id);

  CREATE TABLE IF NOT EXISTS category_items (
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL DEFAULT 1,
    worn INTEGER NOT NULL DEFAULT 0,
    consumable INTEGER NOT NULL DEFAULT 0,
    star INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (category_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS template_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_category_id INTEGER NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    priority TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    example TEXT NOT NULL DEFAULT '',
    more_info TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );
`);

{
  const cols = db.prepare('PRAGMA table_info(category_items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'priority')) {
    db.exec('ALTER TABLE category_items ADD COLUMN priority TEXT');
  }
}

{
  const cols = db.prepare('PRAGMA table_info(lists)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'archived')) {
    db.exec('ALTER TABLE lists ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  }
}

{
  const cols = db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'singleton')) {
    db.exec('ALTER TABLE items ADD COLUMN singleton INTEGER NOT NULL DEFAULT 1');
  }
}

{
  const cols = db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'acquired')) {
    db.exec('ALTER TABLE items ADD COLUMN acquired INTEGER NOT NULL DEFAULT 0');
  }
}

{
  const cols = db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'weighed')) {
    db.exec('ALTER TABLE items ADD COLUMN weighed INTEGER NOT NULL DEFAULT 0');
  }
}

{
  const cols = db.prepare('PRAGMA table_info(category_items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'acquired')) {
    db.exec('ALTER TABLE category_items ADD COLUMN acquired INTEGER NOT NULL DEFAULT 0');
  }
}

{
  const cols = db.prepare('PRAGMA table_info(category_items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'weighed')) {
    db.exec('ALTER TABLE category_items ADD COLUMN weighed INTEGER NOT NULL DEFAULT 0');
  }
}

{
  const cols = db.prepare('PRAGMA table_info(category_items)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'packed')) {
    db.exec('ALTER TABLE category_items ADD COLUMN packed INTEGER NOT NULL DEFAULT 0');
  }
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
