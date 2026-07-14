import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      // Cobertura medida só nos módulos unit-testáveis (funções puras / services
      // sem dependência de DB/HTTP), conforme a lei de cobertura do projeto.
      include: ['src/config/**', 'src/services/**', 'src/lib/**'],
      // load-dotenv é bootstrap de I/O (lê arquivo/env), não lógica unit-testável.
      exclude: ['src/**/*.test.ts', 'src/config/load-dotenv.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
