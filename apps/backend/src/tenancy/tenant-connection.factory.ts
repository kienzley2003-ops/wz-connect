import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { TenantConnection, TenantDbCredentials } from './tenant-connection.registry.js';

/**
 * Factory real de conexão a um banco de tenant (ADR-005/012).
 * Pool pequeno por tenant + idle timeout curto para não esgotar o PostgreSQL.
 */
export function createTenantConnection(credentials: TenantDbCredentials): TenantConnection {
  const pool = new Pool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.user,
    password: credentials.password,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  return {
    db: drizzle(pool),
    close: () => pool.end(),
  };
}
