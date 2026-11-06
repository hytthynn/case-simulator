#!/usr/bin/env node
/**
 * Проверка каталога ассетов (docs/00-ТЗ.md §18, 10-ops-deploy.md §9).
 * На этапе 1 ассеты ещё не выгружены (Q-03/Q-12), поэтому скрипт по умолчанию
 * только отчитывается. `--strict` превращает отсутствующие файлы в ошибку и
 * используется в CI перед релизом.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = resolve(ROOT, 'docs/reference/asset-manifest.txt');
const publicDir = resolve(ROOT, 'apps/web/public/catalog');
const strict = process.argv.includes('--strict');

if (!existsSync(manifest)) {
  console.error('verify-assets: отсутствует docs/reference/asset-manifest.txt');
  process.exit(1);
}

const paths = readFileSync(manifest, 'utf8').split(/\r?\n/).filter(Boolean);
const missing = paths.filter((p) => !existsSync(resolve(publicDir, p.replace(/^assets\/flutter_assets\//, ''))));

console.log(`verify-assets: ${paths.length} путей в манифесте, ${missing.length} отсутствует в каталоге`);
if (missing.length > 0) {
  console.log('  примеры:', missing.slice(0, 5).join(', '));
  if (strict) {
    console.error('verify-assets: --strict: ассеты не выгружены (Q-03/Q-12)');
    process.exit(1);
  }
  console.log('  режим нестрогий: этап 1, выгрузка APK/CDN запланирована на этап 2');
}
