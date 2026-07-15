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
      include: [
        'src/config/**',
        'src/services/**',
        'src/lib/**',
        'src/tenancy/**',
        'src/core/auth/**',
        'src/core/licensing/**',
        'src/core/bi/**',
        'src/modules/**',
        'src/provisioning/**',
      ],
      // Excluídos: bootstrap de I/O e adaptadores de infra (pg/drizzle/http),
      // cobertos por testes de integração, não unitários.
      exclude: [
        'src/**/*.test.ts',
        'src/config/load-dotenv.ts',
        'src/tenancy/tenant-connection.factory.ts',
        'src/tenancy/create-tenant-resolver.ts',
        'src/core/auth/user.repository.ts',
        'src/core/auth/signing-key.repository.ts',
        'src/core/auth/create-auth.ts',
        'src/core/licensing/licensing.repository.ts',
        'src/core/bi/bi.repository.ts',
        // Módulos de produto (I/O no banco do tenant) e composição do registry.
        'src/modules/masterfila/**',
        'src/modules/agenda/**',
        'src/modules/index.ts',
        // Provisionamento: I/O real (pg admin, migrator, seed) e composição.
        'src/provisioning/database-admin.ts',
        'src/provisioning/tenant-db.io.ts',
        'src/provisioning/create-provisioning.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
