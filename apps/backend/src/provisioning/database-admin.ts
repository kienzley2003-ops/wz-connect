import { Client } from 'pg';
import type { Placement } from './placement.js';

/** Código do PostgreSQL para "database already exists". */
const DUPLICATE_DATABASE = '42P04';

/**
 * Cria o banco de um tenant no servidor do placement.
 *
 * Conecta ao banco administrativo `postgres` porque `CREATE DATABASE` não roda
 * dentro de transação nem no próprio banco a criar. O `dbName` **deve** vir de
 * `tenantDatabaseName()` — é interpolado na SQL (CREATE DATABASE não aceita
 * parâmetros ligados).
 */
export async function createDatabase(
  placement: Placement,
  dbName: string,
): Promise<'created' | 'already_exists'> {
  const client = new Client({
    host: placement.host,
    port: placement.port,
    user: placement.user,
    password: placement.password,
    database: 'postgres',
  });

  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${dbName}`);
    return 'created';
  } catch (err) {
    if ((err as { code?: string }).code === DUPLICATE_DATABASE) {
      return 'already_exists';
    }
    throw err;
  } finally {
    await client.end();
  }
}
