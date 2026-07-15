import { defineConfig } from 'drizzle-kit';

/**
 * Config do drizzle-kit para o schema dos BANCOS DE TENANT (ADR-009).
 * Conjunto de migração separado do CORE — aplicado a N bancos pelo tenant-migrator.
 * A URL aqui só serve para o drizzle-kit; a aplicação real usa as credenciais do CORE.
 */
export default defineConfig({
  schema: './src/db/tenant/schema.ts',
  out: './drizzle/tenant',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.TENANT_TEMPLATE_DATABASE_URL ??
      'postgres://wz_connect:wz_connect@localhost:5435/wz_tenant_demo',
  },
});
