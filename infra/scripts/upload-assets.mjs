#!/usr/bin/env node
/**
 * Загрузка ассетов каталога в Supabase Storage (бакет `catalog`, миграция 0012).
 *
 *   pnpm assets:upload --dry-run     # что будет загружено, без сети
 *   pnpm assets:upload               # загрузить
 *   pnpm assets:upload --limit 50    # первые N файлов
 *
 * Источник: локальная папка assets/catalog/ (распакованные PNG/WebP из APK/CDN).
 * ВНУТРИ бакета ключ = относительный путь БЕЗ префикса `catalog/`:
 *   assets/catalog/cases/Kilowatt.png -> cases/Kilowatt.png
 *   -> https://<ref>.supabase.co/storage/v1/object/public/catalog/cases/Kilowatt.png
 * Именно такой URL собирает apps/web из image_url из БД (`catalog/cases/...`).
 *
 * Нужен SUPABASE_URL + SUPABASE_SECRET_KEY (только серверный ключ).
 * Секрет в лог не выводится. Q-03/Q-12: выгрузка 1:1 ассетов Valve требует
 * юридической проверки; до неё каталог показывает заглушки ◈.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE = resolve(ROOT, 'assets/catalog');
const BUCKET = 'catalog';
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const envFile = resolve(ROOT, '.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* переменные могут прийти из окружения CI */
  }
}

const mime = (name) =>
  name.endsWith('.webp') ? 'image/webp'
    : name.endsWith('.avif') ? 'image/avif'
      : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg'
        : 'image/png';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(png|webp|avif|jpe?g)$/i.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SOURCE).slice(0, Number.isFinite(limit) ? limit : undefined);
if (files.length === 0) {
  console.log(`assets:upload: в ${relative(ROOT, SOURCE)} нет изображений.`);
  console.log('  Распакуйте сюда ассеты из APK/CDN (Q-03/Q-12), сохранив структуру cases/ и items/.');
  console.log('  До выгрузки карточки кейсов показывают заглушку ◈ — это нормально для первого деплоя.');
  process.exit(0);
}

console.log(`assets:upload: найдено ${files.length} файлов в ${relative(ROOT, SOURCE)}`);
if (dryRun) {
  for (const file of files.slice(0, 8)) console.log(`  → ${BUCKET}/${relative(SOURCE, file).replace(/\\/g, '/')}`);
  if (files.length > 8) console.log(`  … и ещё ${files.length - 8}`);
  console.log('  --dry-run: сеть не использовалась');
  process.exit(0);
}

const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY ?? '';
if (!url || !key || !url.startsWith('https://')) {
  console.error('assets:upload: нужны SUPABASE_URL и SUPABASE_SECRET_KEY в .env / окружении');
  process.exit(1);
}

let ok = 0;
let failed = 0;
const concurrency = 8;
let cursor = 0;

async function worker() {
  for (;;) {
    const index = cursor++;
    if (index >= files.length) return;
    const file = files[index];
    const objectKey = relative(SOURCE, file).replace(/\\/g, '/');
    const endpoint = `${url}/storage/v1/object/${BUCKET}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          'Content-Type': mime(file),
          'x-upsert': 'true',
          'cache-control': 'public, max-age=31536000, immutable',
        },
        body: readFileSync(file),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${objectKey}: ${String(error).slice(0, 180)}`);
    }
    if ((ok + failed) % 100 === 0) console.log(`  … ${ok + failed}/${files.length}`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
console.log(`assets:upload: загружено ${ok}, ошибок ${failed}`);
if (failed > 0) process.exit(1);
