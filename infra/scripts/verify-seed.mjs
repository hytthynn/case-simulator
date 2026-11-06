#!/usr/bin/env node
/** Статическая проверка миграций/сида без поднятия Postgres (запускается в CI). */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIG = resolve(ROOT, 'packages/db/supabase/migrations');
const problems = [];

const expected = [
  '0001_extensions.sql', '0002_reference.sql', '0003_core.sql', '0004_economy.sql',
  '0005_games.sql', '0006_social.sql', '0007_payments.sql', '0008_rls.sql',
  '0009_functions.sql', '0010_realtime.sql', '0011_cron.sql',
];
for (const file of expected) {
  if (!existsSync(resolve(MIG, file))) problems.push(`нет миграции ${file}`);
}

const rls = existsSync(resolve(MIG, '0008_rls.sql')) ? readFileSync(resolve(MIG, '0008_rls.sql'), 'utf8') : '';
if (!/enable row level security/i.test(rls) || !/revoke all/i.test(rls)) {
  problems.push('0008_rls.sql не включает RLS и revoke grants');
}
if (!/pg_tables/i.test(rls) || !/loop/i.test(rls)) {
  problems.push('0008_rls.sql должен включать RLS для ВСЕХ таблиц через цикл по pg_tables');
}

const funcs = existsSync(resolve(MIG, '0009_functions.sql')) ? readFileSync(resolve(MIG, '0009_functions.sql'), 'utf8') : '';
for (const fn of ['open_case', 'sell_items', 'mass_sell', 'get_me', 'grant_entitlement']) {
  if (!funcs.includes(fn)) problems.push(`0009_functions.sql: отсутствует RPC ${fn}`);
}
if (!/set search_path = ''/.test(funcs)) problems.push('RPC обязаны иметь set search_path = \'\'');

const seed = resolve(ROOT, 'supabase/seed.sql');
if (!existsSync(seed)) problems.push('нет supabase/seed.sql');
else if (!readFileSync(seed, 'utf8').includes('seed-data.sql')) {
  problems.push('supabase/seed.sql не подключает сгенерированный seed-data.sql');
}

const generated = resolve(ROOT, 'supabase/seed-data.sql');
if (existsSync(generated)) {
  const text = readFileSync(generated, 'utf8');
  if (!text.includes('2026-11-05-skinport')) problems.push('seed-data.sql: неверный snapshot_id');
  if (!text.includes('insert into public.items')) problems.push('seed-data.sql: нет предметов');
}

const files = existsSync(MIG) ? readdirSync(MIG).filter((f) => f.endsWith('.sql')) : [];
for (const file of files) {
  const text = readFileSync(resolve(MIG, file), 'utf8');
  // Каждый dollar-quote тег ($$, $fn$, $body$, $policy$) должен встречаться чётное число раз.
  const tags = new Map();
  for (const match of text.matchAll(/\$[A-Za-z_]*\$/g)) {
    tags.set(match[0], (tags.get(match[0]) ?? 0) + 1);
  }
  for (const [tag, count] of tags) {
    if (count % 2 !== 0) problems.push(`${file}: незакрытый dollar-quoted блок ${tag} (${count} маркеров)`);
  }
}
console.log(`verify-seed: ${files.length} миграций, ${existsSync(generated) ? 'сид сгенерирован' : 'сид ещё не генерировался'}`);
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('verify-seed: OK');
