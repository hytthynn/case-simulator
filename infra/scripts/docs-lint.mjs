#!/usr/bin/env node
/**
 * docs-lint: проверки из docs/00-ТЗ.md §20 и 10-ops-deploy.md §5.
 *  1. все ссылки в markdown резолвятся;
 *  2. AGENTS.md <= 200 строк;
 *  3. в changelog есть запись для текущей версии из package.json;
 *  4. базовые security-инварианты (нет секретов/клиентской игровой логики).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const problems = [];
const notes = [];

const abs = (p) => resolve(ROOT, p);
const read = (p) => readFileSync(abs(p), 'utf8');

function walk(dir, out = []) {
  for (const entry of readdirSync(abs(dir))) {
    const rel = join(dir, entry);
    const st = statSync(abs(rel));
    if (st.isDirectory()) {
      if (['node_modules', 'dist', '.git', '.workbuddy-ai'].includes(entry)) continue;
      walk(rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

// --- 1. Ссылки -------------------------------------------------------------
const mdFiles = ['AGENTS.md', 'README.md', ...walk('docs').filter((f) => f.endsWith('.md'))];
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
let checkedLinks = 0;

for (const file of mdFiles) {
  const text = read(file);
  for (const match of text.matchAll(LINK_RE)) {
    let target = match[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|#|data:)/i.test(target)) continue;
    if (target.startsWith('#')) continue;
    target = target.split('#')[0].split('?')[0];
    if (!target || target.includes('…') || target.includes('*') || target.includes('<')) continue;
    checkedLinks += 1;
    const resolved = resolve(dirname(abs(file)), decodeURIComponent(target));
    if (!existsSync(resolved)) {
      problems.push(`[links] ${file}: битая ссылка -> ${target}`);
    }
  }
}
notes.push(`проверено ссылок: ${checkedLinks}`);

// --- 2. AGENTS.md <= 200 строк ---------------------------------------------
const agentsLines = read('AGENTS.md').split(/\r?\n/).length;
if (agentsLines > 200) problems.push(`[docs] AGENTS.md = ${agentsLines} строк (лимит 200)`);
notes.push(`AGENTS.md: ${agentsLines} строк`);

// --- 3. Changelog для текущей версии ---------------------------------------
const { version } = JSON.parse(read('package.json'));
const changelog = read('docs/13-changelog.md');
if (!changelog.includes(`[${version}]`)) {
  problems.push(`[docs] нет записи [${version}] в docs/13-changelog.md`);
}

// --- 4. Security-инварианты -------------------------------------------------
const sourceFiles = walk('apps').concat(walk('packages')).filter((f) => /\.(ts|tsx|js|mjs|sql)$/.test(f));
const scan = (pattern, test, message) => {
  for (const file of sourceFiles) {
    if (!pattern.test(file)) continue;
    const text = read(file);
    if (test(text)) problems.push(`[security] ${file}: ${message}`);
  }
};

scan(/^apps[\\/]web[\\/]/, (t) => /provably-fair/.test(t), 'импорт серверной игровой логики в клиент');
scan(/^apps[\\/]web[\\/]/, (t) => /service_role|sb_secret_|BOT_TOKEN/.test(t), 'секрет в клиентском коде');
scan(/^apps[\\/](bot|web)[\\/]/, (t) => /Math\.random\s*\(/.test(t), 'Math.random() в игровой логике (запрещено ТЗ §13)');
scan(/\.(ts|tsx|js|mjs|sql)$/, (t) => /(sk-|sb_secret_|bot\d{8,}:)[A-Za-z0-9_-]{20,}/.test(t), 'похоже на реальный секретный ключ');

// Артефакты эталонов не должны попадать в git (локально они лежат в корне).
let tracked = '';
try {
  tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
} catch {
  notes.push('git ls-files недоступен — проверка артефактов пропущена');
}
for (const entry of tracked.split(/\r?\n/).filter(Boolean)) {
  if (/\.(apks?|MP4|mp4|db|sqlite3?)$/i.test(entry)) {
    problems.push(`[hygiene] артефакт-эталон в git: ${entry}`);
  }
}
if (!existsSync(abs('.gitignore'))) problems.push('[hygiene] отсутствует .gitignore');
if (extname('.env.example') !== '.example') problems.push('[hygiene] .env.example повреждён');

// --- Отчёт -----------------------------------------------------------------
for (const note of notes) console.log(`  · ${note}`);
if (problems.length > 0) {
  console.error(`\ndocs-lint: ${problems.length} проблем:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('docs-lint: OK');
