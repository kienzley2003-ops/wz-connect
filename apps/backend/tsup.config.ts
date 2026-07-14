import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/db/core/migrate.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @wz/shared é workspace source-only: precisa ser empacotado no bundle.
  noExternal: ['@wz/shared'],
});
