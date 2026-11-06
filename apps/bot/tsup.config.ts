import { defineConfig } from 'tsup';

/**
 * @case-sim/shared — workspace-пакет с TypeScript-исходниками, поэтому он
 * ОБЯЗАН быть встроен в бандл (Node не умеет грузить .ts и .js→.ts алиасы).
 * Остальные runtime-зависимости остаются внешними и копируются в Docker-образ.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  outDir: 'dist',
  noExternal: ['@case-sim/shared'],
});
