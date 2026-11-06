#!/usr/bin/env node
/**
 * Локальное воспроизведение supabase/tests/*.sql на PGlite.
 * GitHub не отдаёт логи pgTAP без токена, поэтому эмулируем минимальные
 * функции pgTAP (plan/is/ok/finish) и печатаем результат КАЖДОЙ проверки.
 *
 *   pnpm db:pgtap
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const MIG = resolve(ROOT, 'supabase/migrations');
const TESTS = resolve(ROOT, 'supabase/tests');

const db = new PGlite();

async function exec(sql, label) {
  try {
    const result = await db.exec(sql);
    return result;
  } catch (error) {
    console.error(`  ✗ ${label}: ${String(error?.message ?? error)}`);
    throw error;
  }
}

// --- окружение (как в check-migrations.mjs) --------------------------------
await exec(`
  create schema if not exists extensions;
  create schema if not exists auth;
  create schema if not exists storage;
  create or replace function extensions.hmac(data text, key text, algo text)
    returns bytea language sql immutable as $s$ select sha256(convert_to(data || key, 'UTF8')) $s$;
  create or replace function extensions.digest(data text, algo text)
    returns bytea language sql immutable as $s$ select sha256(convert_to(data, 'UTF8')) $s$;
  create or replace function extensions.gen_random_bytes(n int)
    returns bytea language sql immutable as $s$ select sha256(convert_to(n::text || clock_timestamp()::text, 'UTF8')) $s$;
  create table if not exists storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;

  -- эмуляция pgTAP
  create or replace function public.plan(n int) returns text language sql as $s$ select '1..' || n $s$;
  create or replace function public.is(a anyelement, b anyelement, msg text) returns text language sql as $s$
    select case when a is not distinct from b then 'ok - ' || msg
      else 'not ok - ' || msg || ' [got=' || coalesce(a::text,'NULL') || ' expected=' || coalesce(b::text,'NULL') || ']' end
  $s$;
  create or replace function public.ok(b boolean, msg text) returns text language sql as $s$
    select case when b then 'ok - ' || msg else 'not ok - ' || msg end
  $s$;
  create or replace function public.finish() returns setof text language sql as $s$ select 'done'::text $s$;
`, 'подготовка');

for (const file of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(resolve(MIG, file), 'utf8')
    .replace(/create extension if not exists pgcrypto[^;]*;/gi, 'select 1;');
  await exec(sql, file);
}

// Справочник редкостей и каталог (обычно грузятся seed.sql).
await exec(`
  insert into public.rarity_config (rarity, weight, color_hex, sort_order) values
    ('consumer', 0, '#B0C3D9', 1), ('industrial', 0, '#5E98D9', 2),
    ('mil_spec', 0.7992, '#4B69FF', 3), ('restricted', 0.1598, '#8847FF', 4),
    ('classified', 0.0320, '#D32CE6', 5), ('covert', 0.0064, '#EB4B4B', 6),
    ('rare_special', 0.0026, '#F5C542', 7)
  on conflict (rarity) do nothing;
  insert into public.items (id, name, type, rarity, image_url, stattrak_eligible, prices, base_price)
    values ('pgtap-item', 'PGTAP Item', 'skin', 'mil_spec', 'x.png', false, '{"price":1.00}'::jsonb, 1.00)
  on conflict (id) do nothing;
`, 'справочники');

let failures = 0;
for (const file of readdirSync(TESTS).filter((f) => f.endsWith('.sql')).sort()) {
  console.log(`\n--- ${file} ---`);
  let results;
  try {
    results = await db.exec(readFileSync(resolve(TESTS, file), 'utf8'));
  } catch (error) {
    console.error(`  ✗ файл упал: ${String(error?.message ?? error).split('\n')[0]}`);
    failures += 1;
    continue;
  }
  for (const block of results ?? []) {
    for (const row of block.rows ?? []) {
      const text = Object.values(row).map((v) => (v === null ? 'NULL' : String(v))).join(' | ');
      if (!text || text === 'done' || text.startsWith('1..')) continue;
      console.log(`  ${text}`);
      if (text.startsWith('not ok')) failures += 1;
    }
  }
}

console.log(`\ncheck-pgtap: провалено проверок: ${failures}`);
process.exitCode = failures ? 1 : 0;
