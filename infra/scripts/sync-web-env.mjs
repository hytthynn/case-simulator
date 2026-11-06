#!/usr/bin/env node
/**
 * Выводит build-time VITE_* из уже заполненного корневого .env и пишет
 * apps/web/.env. Исключает ручной ввод и расхождения между файлами.
 *
 *   pnpm env:sync
 *
 * Ни один секрет не попадает в apps/web/.env: только публичные значения.
 * Старый файл сохраняется в apps/web/.env.bak (тоже в .gitignore).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const source = resolve(ROOT, '.env');
const target = resolve(ROOT, 'apps/web/.env');

function parse(path) {
  const out = new Map();
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let value = line.slice(eq + 1).trim();
    const hash = value.indexOf(' #');
    if (hash >= 0) value = value.slice(0, hash).trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    out.set(line.slice(0, eq).trim(), value);
  }
  return out;
}

const env = parse(source);
const get = (key) => (process.env[key] ?? env.get(key) ?? '').trim();
const errors = [];

const supabaseUrl = get('SUPABASE_URL').replace(/\/+$/, '');
const publishable = get('SUPABASE_PUBLISHABLE_KEY');
const webhook = get('TELEGRAM_WEBHOOK_URL').replace(/\/+$/, '');
const api = webhook.endsWith('/telegram/webhook')
  ? webhook.slice(0, -'/telegram/webhook'.length)
  : webhook;

if (!supabaseUrl.startsWith('https://')) errors.push('SUPABASE_URL');
if (!publishable) errors.push('SUPABASE_PUBLISHABLE_KEY');
if (publishable.startsWith('sb_secret_')) errors.push('SUPABASE_PUBLISHABLE_KEY должен быть publishable, а не secret');
if (!api.startsWith('https://')) errors.push('TELEGRAM_WEBHOOK_URL (не удалось вывести API origin)');
if (api.endsWith('/v1')) errors.push('API origin содержит /v1 — уберите его из TELEGRAM_WEBHOOK_URL');

if (errors.length) {
  console.error(`env:sync: проверьте корневой .env: ${errors.join(', ')}`);
  process.exit(1);
}

const values = {
  VITE_API_BASE_URL: api,
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: publishable,
  VITE_CDN_BASE_URL: `${supabaseUrl}/storage/v1/object/public`,
  VITE_MINIAPP_VERSION: '0.2.0',
  VITE_DEFAULT_LOCALE: 'ru',
};

if (existsSync(target) && readFileSync(target, 'utf8').trim()) {
  writeFileSync(`${target}.bak`, readFileSync(target, 'utf8'), 'utf8');
}

const content = [
  '# СГЕНЕРИРОВАНО pnpm env:sync из корневого .env. НЕ коммитится.',
  `# ${new Date().toISOString()}`,
  '# В локальном dev эти значения НЕ нужны (Vite проксирует /v1 на :3000).',
  '# Для деплоя продублируйте их в build-time env Cloudflare Pages.',
  '',
  ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
  '',
].join('\n');
writeFileSync(target, content, 'utf8');

console.log('env:sync: apps/web/.env обновлён');
for (const [k, v] of Object.entries(values)) {
  console.log(`  ${k}=${v.length > 24 ? `${v.slice(0, 24)}…` : v}`);
}
console.log('\nДля Cloudflare Pages задайте те же VITE_* как build-time переменные.');
