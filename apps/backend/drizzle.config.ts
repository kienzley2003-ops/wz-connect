import { defineConfig } from 'drizzle-kit';

/** Config do drizzle-kit para o schema do banco central WZ_CONNECT_CORE. */
export default defineConfig({
  schema: './src/db/core/schema.ts',
  out: './drizzle/core',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.CORE_DATABASE_URL ??
      'postgres://wz_connect:wz_connect@localhost:5432/wz_connect_core',
  },
});
