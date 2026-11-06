#!/usr/bin/env node
/**
 * Cloudflare Pages читает `_headers` из КОРНЯ собранного каталога (dist/).
 * Vite копирует туда всё из apps/web/public, поэтому перед сборкой:
 *   1. берём шаблон infra/cloudflare/_headers,
 *   2. подставляем реальные origin-ы из VITE_* (никакого ручного редактирования),
 *   3. пишем apps/web/public/_headers → dist/_headers.
 *
 * С флагом --strict (или CSP_STRICT=true) незакрытые токены = ошибка сборки;
 * используется только деплойной сборкой build:deploy. Обычный pnpm build / CI
 * без VITE_* деградирует до 'self' (локально Vite проксирует /v1).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const source = resolve(ROOT, 'infra/cloudflare/_headers');
const targetDir = resolve(ROOT, 'apps/web/public');
const target = resolve(targetDir, '_headers');
const strict = process.env.CSP_STRICT === 'true' || process.argv.includes('--strict');

function originOf(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const api = originOf(process.env.VITE_API_BASE_URL);
const supabase = originOf(process.env.VITE_SUPABASE_URL);
const cdn = originOf(process.env.VITE_CDN_BASE_URL);

const values = {
  '{{API_ORIGIN}}': api,
  '{{SUPABASE_ORIGIN}}': supabase,
  '{{WS_SUPABASE_ORIGIN}}': supabase ? supabase.replace(/^https:/, 'wss:') : null,
  '{{CDN_ORIGIN}}': cdn,
};

let text = readFileSync(source, 'utf8');
const missing = [];
for (const [token, value] of Object.entries(values)) {
  if (value) {
    text = text.split(token).join(value);
  } else {
    missing.push(token);
    text = text.split(token).join("'self'");
  }
}

if (missing.length) {
  if (strict) {
    console.error(
      `copy-headers: деплойная сборка требует VITE_API_BASE_URL / VITE_SUPABASE_URL / VITE_CDN_BASE_URL. Не заменено: ${missing.join(', ')}`,
    );
    process.exit(1);
  }
  console.warn(`copy-headers: локальная сборка без VITE_* — origin-ы деградируют до 'self' (${missing.length})`);
}

mkdirSync(targetDir, { recursive: true });
writeFileSync(target, text, 'utf8');
console.log(
  `copy-headers: _headers → ${api ?? "'self'"}, ${supabase ?? "'self'"}, ${cdn ?? "'self'"} ` +
    `(strict=${strict}, файл ${existsSync(target) ? 'записан' : 'ошибка'})`,
);
