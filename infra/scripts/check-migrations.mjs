#!/usr/bin/env node
/**
 * Синтаксическая/семантическая проверка ВСЕХ миграций без Docker и Supabase CLI.
 * Использует PGlite = настоящий Postgres (WASM) прямо в Node.
 *
 *   pnpm db:check
 *
 * pgcrypto в PGlite недоступен, поэтому перед накатом создаются SQL-заглушки
 * extensions.hmac/digest/gen_random_bytes и минимальные схемы auth/storage.
 * Это проверяет именно наш SQL: таблицы, RLS, политики, PL/pgSQL RPC, триггеры.
 */
import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const MIG = resolve(ROOT, 'packages/db/supabase/migrations');
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();

const db = new PGlite();

try {
  // --- Окружение, эмулирующее Supabase ------------------------------------
  await db.exec(`
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
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text, name text
    );
    alter table storage.objects enable row level security;
  `);
} catch (error) {
  console.error('check-migrations: не удалось подготовить окружение:', error);
  process.exit(1);
}

let applied = 0;
for (const file of files) {
  let sql = readFileSync(resolve(MIG, file), 'utf8');
  // PGlite не поставляет pgcrypto/pg_cron: заменяем только CREATE EXTENSION.
  sql = sql.replace(/create extension if not exists pgcrypto[^;]*;/gi, 'select 1;');
  try {
    await db.exec(sql);
    applied += 1;
    console.log(`  ✓ ${file}`);
  } catch (error) {
    console.error(`\n  ✗ ${file}`);
    console.error(String(error?.message ?? error));
    console.error(`\ncheck-migrations: упало на миграции ${file} (${applied} из ${files.length} применены)`);
    process.exit(1);
  }
}

// --- smoke: ключевые объекты должны существовать ---------------------------
const checks = [
  ['таблицы public', "select count(*)::int as n from pg_tables where schemaname='public'", 20],
  ['RLS', "select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity", 20],
  ['RPC open_case', "select count(*)::int as n from pg_proc where proname='open_case'", 1],
  ['бакет catalog', "select count(*)::int as n from storage.buckets where id='catalog' and public", 1],
  ['политика storage', "select count(*)::int as n from pg_policies where policyname='catalog_public_read'", 1],
];
let failed = 0;
for (const [label, query, min] of checks) {
  try {
    const result = await db.query(query);
    const n = result.rows[0]?.n ?? 0;
    if (Number(n) < min) {
      console.error(`  ✗ ${label}: ${n} (ожидалось ≥${min})`);
      failed += 1;
    } else {
      console.log(`  ✓ ${label}: ${n}`);
    }
  } catch (error) {
    console.error(`  ✗ ${label}: ${String(error?.message ?? error)}`);
    failed += 1;
  }
}

console.log(`\ncheck-migrations: ${applied}/${files.length} миграций применены`);
if (failed) process.exit(1);
console.log('check-migrations: OK (SQL валиден без Docker)');
