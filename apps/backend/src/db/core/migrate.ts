import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../../config/env.js';
import { loadDotenvIfPresent } from '../../config/load-dotenv.js';
import { createCorePool, createCoreDb } from './client.js';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle/core');

/** Aplica as migrações do banco central WZ_CONNECT_CORE. */
export async function runCoreMigrations(connectionString: string): Promise<void> {
  const pool = createCorePool(connectionString);
  try {
    const db = createCoreDb(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

// Execução direta: `pnpm --filter @wz/backend db:migrate`
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  runCoreMigrations(cfg.coreDatabaseUrl)
    .then(() => {
      console.log('[migrate] CORE: migrações aplicadas com sucesso.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] CORE: falha ao aplicar migrações:', err);
      process.exit(1);
    });
}
