import { Client } from 'pg';
import type { Placement } from './placement.js';

/** Código do PostgreSQL para "database already exists". */
const DUPLICATE_DATABASE = '42P04';
/** Código do PostgreSQL para "role already exists". */
const DUPLICATE_OBJECT = '42710';

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

/**
 * Cria (ou rotaciona a senha da) role dedicada do tenant, a torna **dona** do
 * banco dele e **fecha o banco para o resto do mundo**.
 *
 * É o que torna o isolamento do ADR-004 real no nível de credencial: com uma
 * credencial compartilhada, entregá-la a um produto entregaria todos os tenants.
 * Como a role é dona, também não há bagunça de ownership nas migrações.
 *
 * O `REVOKE ... FROM PUBLIC` é essencial e **não** é redundante: no PostgreSQL o
 * papel `PUBLIC` recebe `CONNECT` em todo banco por padrão, então sem ele
 * qualquer role de tenant abriria o banco dos outros (e o CORE). Verificado por
 * E2E.
 *
 * `roleName`/`password` **devem** vir de `tenantRoleName()`/
 * `generateDatabasePassword()`: DDL não aceita parâmetros ligados.
 */
export async function ensureTenantRole(
  placement: Placement,
  dbName: string,
  roleName: string,
  password: string,
): Promise<void> {
  const admin = new Client({
    host: placement.host,
    port: placement.port,
    user: placement.user,
    password: placement.password,
    database: 'postgres',
  });

  await admin.connect();
  try {
    try {
      await admin.query(`CREATE ROLE ${roleName} WITH LOGIN PASSWORD '${password}'`);
    } catch (err) {
      if ((err as { code?: string }).code !== DUPLICATE_OBJECT) throw err;
      // Idempotente: role já existe — rotaciona a senha.
      await admin.query(`ALTER ROLE ${roleName} WITH LOGIN PASSWORD '${password}'`);
    }
    await admin.query(`ALTER DATABASE ${dbName} OWNER TO ${roleName}`);
    // Fecha o banco: só a role dona (e o superusuário) conectam.
    await admin.query(`REVOKE CONNECT ON DATABASE ${dbName} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${roleName}`);
  } finally {
    await admin.end();
  }
}
