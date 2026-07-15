import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { tenantInfo } from '../db/tenant/schema.js';
import type { Placement } from './placement.js';
import type { TenantRecord } from './provisioning.service.js';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle/tenant');

/** Pool efêmero para operações administrativas num banco de tenant. */
function tenantPool(placement: Placement, dbName: string): Pool {
  return new Pool({
    host: placement.host,
    port: placement.port,
    user: placement.user,
    password: placement.password,
    database: dbName,
    max: 1,
  });
}

/** Aplica as migrações pendentes do schema de tenant a UM banco (ADR-009). */
export async function migrateTenantDatabase(placement: Placement, dbName: string): Promise<void> {
  const pool = tenantPool(placement, dbName);
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

/** Seed inicial do banco do tenant. Idempotente. */
export async function seedTenantDatabase(
  placement: Placement,
  dbName: string,
  tenant: TenantRecord,
): Promise<void> {
  const pool = tenantPool(placement, dbName);
  try {
    const db = drizzle(pool);
    const existing = await db
      .select()
      .from(tenantInfo)
      .where(eq(tenantInfo.tenantId, tenant.id))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(tenantInfo).values({ tenantId: tenant.id, subdominio: tenant.subdominio });
    }
    // Seeds de módulos entram aqui na Fase 5 (via WzModule.seed).
  } finally {
    await pool.end();
  }
}
