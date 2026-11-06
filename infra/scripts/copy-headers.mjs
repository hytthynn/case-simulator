#!/usr/bin/env node
/**
 * Cloudflare Pages читает `_headers` из КОРНЯ собранного каталога (dist/).
 * Vite копирует туда всё из apps/web/public, поэтому перед сборкой переносим
 * infra/cloudflare/_headers в public/. Файл генерируемый и в git не коммитится.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const source = resolve(ROOT, 'infra/cloudflare/_headers');
const targetDir = resolve(ROOT, 'apps/web/public');
const target = resolve(targetDir, '_headers');

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log('copy-headers: infra/cloudflare/_headers -> apps/web/public/_headers');
