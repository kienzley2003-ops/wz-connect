import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

/** Cria o pool de conexões do banco central WZ_CONNECT_CORE. */
export function createCorePool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

/** Instância Drizzle tipada sobre o schema do CORE. */
export function createCoreDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export type CoreDb = ReturnType<typeof createCoreDb>;
