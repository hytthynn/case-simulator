#!/usr/bin/env node
/**
 * Генерация supabase/seed-data.sql из НЕИЗМЕНЯЕМЫХ снимков docs/reference/
 * (D-04: снимок цен 05.11.2026, ежедневного импорта нет).
 *
 *   pnpm db:seed:generate
 *
 * Никаких сетевых запросов к оригинальному API/CDN — только локальные снимки.
 * Точные веса дропа Q-04 и соответствие case → item (Q-12) пока не восстановлены:
 * rarity/type выводятся эвристически и помечены INTERIM в комментариях SQL.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REF = resolve(ROOT, 'docs/reference');
const OUT = resolve(ROOT, 'supabase/seed-data.sql');

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const enc = (name) => encodeURIComponent(name).replace(/'/g, '%27');

for (const file of ['prices.json', 'case-names.txt', 'flags.json']) {
  if (!existsSync(resolve(REF, file))) throw new Error(`Отсутствует снимок docs/reference/${file}`);
}

const rawPrices = readFileSync(resolve(REF, 'prices.json'), 'utf8');
const snapshot = JSON.parse(rawPrices);
const prices = snapshot.prices;
const checksum = createHash('sha256').update(rawPrices).digest('hex');
const caseNames = readFileSync(resolve(REF, 'case-names.txt'), 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
const flags = JSON.parse(readFileSync(resolve(REF, 'flags.json'), 'utf8'));

function classify(name) {
  if (name.startsWith('★') || name.includes('Gloves') || name.includes('Knife')) {
    return { type: name.includes('Gloves') ? 'glove' : 'knife', rarity: 'rare_special', st: true };
  }
  if (name.startsWith('Sticker |')) return { type: 'sticker', rarity: 'consumer', st: false };
  if (/Case$|Capsule$|Package$|Sticker Capsule/.test(name)) return { type: 'package', rarity: 'consumer', st: false };
  if (/^Agent|Agents\//.test(name)) return { type: 'agent', rarity: 'restricted', st: false };
  return { type: 'skin', rarity: 'mil_spec', st: true };
}

function basePrice(entry) {
  if (typeof entry.price === 'number') return entry.price;
  const values = Object.values(entry).filter((v) => typeof v === 'number');
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0;
}

const lines = [
  '-- СГЕНЕРИРОВАНО infra/scripts/import-prices.mjs. НЕ редактировать вручную.',
  `-- Источник: docs/reference/prices.json (${snapshot._lastUpdated}, ${snapshot._source}), checksum ${checksum}`,
  '-- INTERIM [Q-04/Q-12]: rarity/type/item→case выведены эвристически, точные таблицы дропа',
  '-- будут загружены после разбора CDN. Экономика НЕ меняется без ADR.',
  '',
  'set search_path = public;',
  '',
  `insert into public.price_snapshots (id, captured_at, source, item_count, checksum, meta, imported_at)`,
  `values (${q('2026-11-05-skinport')}, date ${q(snapshot._lastUpdated)}, ${q(snapshot._source)}, ` +
    `${Object.keys(prices).length}, ${q(checksum)}, ${q(JSON.stringify({ stattrakMultiplier: snapshot.stattrakMultiplier }))}::jsonb, now())`,
  `on conflict (id) do update set checksum = excluded.checksum, item_count = excluded.item_count;`,
  '',
];

// Пакеты по 500 строк, чтобы psql не упирался в лимит одного statement.
function chunks(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
}

const itemEntries = Object.entries(prices);
for (const batch of chunks(itemEntries, 500)) {
  lines.push('insert into public.items (id, name, type, rarity, image_url, stattrak_eligible, min_float, max_float, prices, base_price, stattrak_multiplier) values');
  lines.push(
    batch
      .map(([name, entry]) => {
        const c = classify(name);
        return `  (${q(name)}, ${q(name)}, ${q(c.type)}, ${q(c.rarity)}, ${q(`catalog/items/${enc(name)}.png`)}, ` +
          `${c.st ? 'true' : 'false'}, 0.000, 1.000, ${q(JSON.stringify(entry))}::jsonb, ${basePrice(entry)}, ${snapshot.stattrakMultiplier})`;
      })
      .join(',\n') + '\non conflict (id) do nothing;',
  );
  lines.push('');
}

for (const batch of chunks(itemEntries, 500)) {
  lines.push('insert into public.price_entries (snapshot_id, item_id, prices) values');
  lines.push(
    batch
      .map(([name, entry]) => `  (${q('2026-11-05-skinport')}, ${q(name)}, ${q(JSON.stringify(entry))}::jsonb)`)
      .join(',\n') + '\non conflict (snapshot_id, item_id) do nothing;',
  );
  lines.push('');
}

lines.push('-- 241 кейс/капсула из reference/case-names.txt');
lines.push('insert into public.cases (id, name, kind, image_url, base_price, key_price, min_level, section, sort_order, enabled, meta) values');
lines.push(
  caseNames
    .map((name, index) => {
      const kind = /Souvenir Package/.test(name) ? 'souvenir' : /Capsule|Sticker/.test(name) ? 'capsule' : 'case';
      const section = kind === 'capsule' ? 'capsules' : kind === 'souvenir' ? 'souvenir' : 'cases';
      const price = prices[name]?.price ?? basePrice(prices[name] ?? {});
      return `  (${q(name)}, ${q(name)}, ${q(kind)}, ${q(`catalog/cases/${enc(name)}.png`)}, ${price}, 0, 1, ` +
        `${q(section)}, ${index}, true, '{}'::jsonb)`;
    })
    .join(',\n') + '\non conflict (id) do nothing;',
);
lines.push('');

lines.push('-- Фича-флаги оригинала (?platform=android), A-14: в TMA свой набор');
lines.push('insert into public.admin_flags (key, value, updated_at) values');
lines.push(
  Object.entries(flags)
    .map(([key, value]) => `  (${q(key)}, ${q(JSON.stringify(value))}::jsonb, now())`)
    .join(',\n') + '\non conflict (key) do update set value = excluded.value, updated_at = now();',
);
lines.push('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(
  `seed-data.sql: ${itemEntries.length} предметов, ${caseNames.length} кейсов, ` +
    `${Object.keys(flags).length} флагов, ${(Buffer.byteLength(lines.join('\n')) / 1024).toFixed(0)} KB`,
);
