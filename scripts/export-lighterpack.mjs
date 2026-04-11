#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = process.env.LP_BASE_URL || 'https://lighterpack.com';
const USERNAME = process.env.LP_USERNAME;
const PASSWORD = process.env.LP_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error('Missing LP_USERNAME or LP_PASSWORD. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function signin() {
  const body = new URLSearchParams({ username: USERNAME, password: PASSWORD });
  const res = await fetch(`${BASE_URL}/signin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Signin failed: ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    console.error('Signin response was not JSON:');
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  const cookie = res.headers.getSetCookie?.().find((c) => c.startsWith('lp=')) || null;
  return { payload, cookie };
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function main() {
  console.log(`Signing in to ${BASE_URL} as ${USERNAME}...`);
  const { payload, cookie } = await signin();

  if (typeof payload.library !== 'string') {
    console.error('Unexpected signin payload shape — expected library as a JSON string.');
    console.error(JSON.stringify(payload, null, 2).slice(0, 500));
    process.exit(1);
  }

  const library = JSON.parse(payload.library);

  const outDir = join('data', 'lighterpack', timestamp());
  await mkdir(outDir, { recursive: true });

  await writeJson(join(outDir, 'raw-signin-response.json'), {
    username: payload.username,
    syncToken: payload.syncToken,
    library,
  });
  await writeJson(join(outDir, 'library.json'), library);
  await writeJson(join(outDir, 'items.json'), library.items || []);
  await writeJson(join(outDir, 'categories.json'), library.categories || []);
  await writeJson(join(outDir, 'lists.json'), library.lists || []);

  const { items, categories, lists, ...settings } = library;
  await writeJson(join(outDir, 'settings.json'), settings);

  if (cookie) {
    await writeFile(join(outDir, 'session-cookie.txt'), cookie + '\n', { mode: 0o600 });
  }

  const summary = [
    `Lighterpack export`,
    `User:        ${payload.username}`,
    `syncToken:   ${payload.syncToken}`,
    `Version:     ${library.version}`,
    `Items:       ${(library.items || []).length}`,
    `Categories:  ${(library.categories || []).length}`,
    `Lists:       ${(library.lists || []).length}`,
    `Total unit:  ${library.totalUnit}`,
    `Item unit:   ${library.itemUnit}`,
    `Currency:    ${library.currencySymbol}`,
    '',
    'Lists:',
    ...(library.lists || []).map((l) => `  [${l.id}] ${l.name}  (${(l.categoryIds || []).length} categories, externalId=${l.externalId || '-'})`),
    '',
  ].join('\n');
  await writeFile(join(outDir, 'summary.txt'), summary, 'utf8');

  console.log(summary);
  console.log(`Wrote export to ${outDir}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
