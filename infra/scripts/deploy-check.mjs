#!/usr/bin/env node
/**
 * Preflight перед деплоем: проверяет, что закрыты Q-01/Q-02 и ничего не забыто.
 *
 *   pnpm deploy:check
 *
 * Работает и локально (читает корневой .env), и в GitHub Actions (переменные
 * приходят из secrets). Ни один секрет не выводится — только имя и статус.
 * Exit 1 при наличии ошибок; предупреждения деплой не блокируют.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const errors = [];
const warnings = [];
const ok = [];

const envFile = resolve(ROOT, '.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    errors.push('Не удалось прочитать .env (проверьте синтаксис)');
  }
}

const isPlaceholder = (v) => v === '' || /<[^>]+>|\.\.\.|example\.com|your[-_]?domain|project-ref/i.test(v);

function check(name, { required = true, validate, hint }) {
  const value = (process.env[name] ?? '').trim();
  if (isPlaceholder(value)) {
    (required ? errors : warnings).push(
      `${name}: ${value ? `плейсхолдер «${value}»` : 'не задан'}${hint ? ` — ${hint}` : ''}`,
    );
    return;
  }
  const problem = validate?.(value);
  if (problem) {
    (required ? errors : warnings).push(`${name}: ${problem}`);
    return;
  }
  ok.push(name);
}

const https = (v) => (v.startsWith('https://') ? null : 'должен быть HTTPS');

console.log('deploy-check · проверка готовности к деплою\n');

// --- Telegram (Q-01) --------------------------------------------------------
check('TELEGRAM_BOT_TOKEN', {
  validate: (v) => (/^\d+:[A-Za-z0-9_-]{20,}$/.test(v) ? null : 'похоже не на токен @BotFather'),
  hint: '@BotFather /newbot; хранить в Railway Secrets / GitHub Secrets',
});
check('TELEGRAM_WEBHOOK_SECRET', {
  validate: (v) => (v.length >= 16 ? null : 'минимум 16 символов (openssl rand -hex 32)'),
});
check('TELEGRAM_WEBHOOK_URL', {
  validate: (v) =>
    https(v) ??
    (v.endsWith('/telegram/webhook') ? null : 'URL должен заканчиваться на /telegram/webhook'),
  hint: 'https://api.<domain>/telegram/webhook',
});
check('TELEGRAM_BOT_USERNAME', { required: false, hint: 'для /start и ссылок' });

// --- Supabase (Q-02) --------------------------------------------------------
check('SUPABASE_URL', { validate: https, hint: 'Project Settings → API → Project URL' });
check('SUPABASE_SECRET_KEY', {
  validate: (v) => (v.startsWith('sb_secret_') ? null : 'ожидается sb_secret_... (не publishable!)'),
});
check('SUPABASE_PUBLISHABLE_KEY', { required: false });
check('SUPABASE_JWT_JWK', {
  validate: (v) => {
    try {
      const jwk = JSON.parse(v);
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) return 'ожидается приватный ES256 JWK';
      if (!jwk.kid) return 'нет kid — добавьте kid из Supabase Signing Keys (иначе RLS не примет JWT)';
      return null;
    } catch {
      return 'невалидный JSON; JWK должен быть одной строкой';
    }
  },
  hint: 'supabase gen signing-key --algorithm ES256',
});
check('DATABASE_URL', { required: false, hint: 'нужен для загрузки каталога (seed) в прод' });

// --- Сборка SPA (VITE_* = build-time, публичные) ----------------------------
check('VITE_API_BASE_URL', {
  validate: (v) => https(v) ?? (v.replace(/\/+$/, '').endsWith('/v1') ? 'не добавляйте /v1 — клиент делает это сам' : null),
  hint: 'https://api.<domain> — БЕЗ /v1 на конце',
});
check('VITE_SUPABASE_URL', { validate: https });
check('VITE_SUPABASE_PUBLISHABLE_KEY', {
  validate: (v) => (v.startsWith('sb_secret_') || v.startsWith('service_role') ? 'это СЕКРЕТНЫЙ ключ, нужен sb_publishable_…' : null),
});
check('VITE_CDN_BASE_URL', {
  required: false,
  validate: https,
  hint: 'https://<cdn> БЕЗ /catalog (пути в БД уже содержат catalog/…); без него картинки будут заглушками',
});

// --- Файлы и конфигурация --------------------------------------------------
const headersFile = resolve(ROOT, 'infra/cloudflare/_headers');
if (!existsSync(headersFile)) {
  errors.push('infra/cloudflare/_headers отсутствует');
} else {
  const text = readFileSync(headersFile, 'utf8');
  const placeholders = ['api.example.com', '*.fly.dev', '<domain>', '<cdn>'].filter((p) => text.includes(p));
  if (placeholders.length) {
    errors.push(`CSP _headers содержит плейсхолдеры: ${placeholders.join(', ')} (Q-16)`);
  } else {
    ok.push('CSP _headers (токены подставляются copy-headers.mjs)');
  }
}

const builtHeaders = resolve(ROOT, 'apps/web/dist/_headers');
if (existsSync(builtHeaders) && readFileSync(builtHeaders, 'utf8').includes('{{')) {
  errors.push('apps/web/dist/_headers содержит незакрытые {{TOKEN}} — проверьте VITE_* в build-time env');
}

if (!existsSync(resolve(ROOT, '.dockerignore'))) {
  errors.push('.dockerignore отсутствует — в Railway уедут MP4/APKS/node_modules');
} else {
  ok.push('.dockerignore');
}

let tracked = '';
try {
  tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
} catch {
  warnings.push('git ls-files недоступен');
}
for (const line of tracked.split(/\r?\n/).filter(Boolean)) {
  if (/^\.env$|^apps\/web\/\.env$|^supabase\/seed-data\.sql$/.test(line)) {
    errors.push(`секрет/генерат закоммичен: ${line}`);
  }
}

if (!existsSync(resolve(ROOT, 'supabase/seed-data.sql'))) {
  warnings.push('supabase/seed-data.sql не сгенерирован — перед сидом выполните pnpm db:seed:generate');
}

// --- Отчёт -----------------------------------------------------------------
for (const name of ok) console.log(`  ✓ ${name}`);
for (const w of warnings) console.log(`  ! ${w}`);
for (const e of errors) console.error(`  ✗ ${e}`);
console.log(`\nИтого: ${ok.length} OK, ${warnings.length} предупреждений, ${errors.length} ошибок`);
if (errors.length) {
  console.error('\nДеплой ЗАБЛОКИРОВАН. Закройте Q-01/Q-02 и заполните переменные — см. README.md §«Деплой».');
  process.exit(1);
}
console.log('deploy-check: OK (можно деплоить)');
