import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one real Postgres DB (no dedicated test DB —
    // see vitest.config.ts note in the Frente A infra plan) and TRUNCATE it
    // in beforeEach. Running test files in parallel causes cross-file
    // deadlocks and unique-constraint collisions on shared rows, so file
    // parallelism is disabled; tests within a single file still run fast.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/routes/**',
        'src/**/routes.ts',
        'src/server.ts',
        'src/db/migrate.ts',
        'src/db/schema.ts',
        'src/test-utils/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
