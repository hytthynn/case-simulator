#!/usr/bin/env node
/**
 * Локальный статус .env: что заполнено, что осталось плейсхолдером.
 *
 *   pnpm env:check            # отчёт (секреты показываются только маской)
 *   pnpm env:check --strict   # exit 1, если обязательные поля не заполнены
 *
 * НИКОГДА не печатает значения целиком. Не читает .env.example как источник
 * значений — только как список ожидаемых ключей.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const envPath = resolve(ROOT, '.env');
const templatePath = resolve(ROOT, '.env.example');
const strict = process.argv.includes('--strict');

const GROUPS = [
  {
    title: 'Telegram (Q-01)',
    keys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_WEBHOOK_URL', 'TELEGRAM_USE_TEST_ENV'],
  },
  {
    title: 'Supabase (Q-02)',
    keys: ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_JWT_JWK', 'DATABASE_URL'],
  },
  {
    title: 'Сервис',
    keys: ['PORT', 'NODE_ENV', 'INIT_DATA_TTL_SECONDS', 'PRICE_SNAPSHOT_ID'],
  },
];

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_WEBHOOK_URL',
  'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_JWT_JWK',
];

const isPlaceholder = (v) => v === '' || /<[^>]+>|\.\.\.|example\.com|your[-_]?domain|project-ref/i.test(v);

function parseEnvFile(path) {
  const out = new Map();
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Node --env-file отрезает inline-комментарий — повторяем то же поведение.
    const hash = value.indexOf(' #');
    if (hash >= 0) value = value.slice(0, hash).trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    out.set(key, value);
  }
  return out;
}

function mask(key, value) {
  if (key === 'SUPABASE_JWT_JWK') {
    try {
      const jwk = JSON.parse(value);
      return `JWK kty=${jwk.kty ?? '?'} kid=${jwk.kid ? 'есть' : 'НЕТ'} d=${jwk.d ? 'есть' : 'НЕТ'}`;
    } catch {
      return 'JWK (невалидный JSON)';
    }
  }
  if (value.length <= 6) return value;
  return `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

const fileValues = parseEnvFile(envPath);
const templateKeys = new Set(parseEnvFile(templatePath).keys());
const problems = [];

console.log('env:check · статус локальной конфигурации\n');
if (!existsSync(envPath)) {
  console.log('  ! .env не найден — выполните: cp .env.example .env\n');
} else {
  try {
    execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: ROOT });
    console.log('  ✓ .env игнорируется git\n');
  } catch {
    problems.push('.env НЕ игнорируется git — проверьте .gitignore!');
  }
}

for (const group of GROUPS) {
  console.log(`  ${group.title}`);
  for (const key of group.keys) {
    const fromFile = fileValues.get(key);
    const fromEnv = process.env[key];
    const value = (fromEnv ?? fromFile ?? '').trim();
    const source = fromEnv ? 'shell' : fromFile !== undefined ? '.env' : '—';
    let status;
    if (isPlaceholder(value)) status = value ? 'ПЛЕЙСХОЛДЕР' : 'ПУСТО';
    else status = 'OK';
    if (REQUIRED.includes(key) && status !== 'OK') problems.push(`${key}: ${status.toLowerCase()}`);
    const shown = status === 'OK' ? mask(key, value) : value || '(нет значения)';
    console.log(`    ${status.padEnd(12)} ${key.padEnd(32)} ${shown.padEnd(34)} [${source}]`);
  }
  console.log('');
}

const unknown = [...fileValues.keys()].filter((k) => !templateKeys.has(k));
if (unknown.length) console.log(`  ! Ключи вне шаблона: ${unknown.join(', ')}`);

// --- Фронтенд: apps/web/.env (пустое значение = корректный dev) ------------
const webEnvPath = resolve(ROOT, 'apps/web/.env');
const webValues = parseEnvFile(webEnvPath);
const WEB_KEYS = [
  ['VITE_API_BASE_URL', 'обязателен в проде, БЕЗ /v1'],
  ['VITE_SUPABASE_URL', 'CSP connect-src'],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', 'публичный ключ'],
  ['VITE_CDN_BASE_URL', 'БЕЗ /catalog на конце'],
  ['VITE_MINIAPP_VERSION', 'резерв'],
  ['VITE_DEFAULT_LOCALE', 'резерв'],
];
console.log('  Фронтенд · apps/web/.env (в dev оставьте ВСЁ закомментированным)');
if (!existsSync(webEnvPath)) console.log('    (файл не создан — это нормально для dev)');
for (const [key, note] of WEB_KEYS) {
  const value = (process.env[key] ?? webValues.get(key) ?? '').trim();
  const status = !value ? 'ПУСТО (OK)' : isPlaceholder(value) ? 'ПЛЕЙСХОЛДЕР' : 'OK';
  const shown = value ? mask(key, value) : key === 'VITE_API_BASE_URL' ? '(прокси :3000)' : '(не задано)';
  console.log(`    ${status.padEnd(12)} ${key.padEnd(32)} ${shown.padEnd(30)} ${note}`);
}
console.log('');
console.log('  apps/web/.env в git не попадает: для Cloudflare Pages задайте VITE_* как build-time env.');
console.log('  Полная проверка перед деплоем: pnpm deploy:check');

if (problems.length) {
  console.log(`\n  Итого: ${problems.length} незаполненных обязательных полей.`);
  for (const p of problems) console.log(`    ✗ ${p}`);
  if (strict) process.exit(1);
  console.log('  (информационный режим; с --strict был бы exit 1)');
} else {
  console.log('\nenv:check: обязательные поля заполнены');
}
