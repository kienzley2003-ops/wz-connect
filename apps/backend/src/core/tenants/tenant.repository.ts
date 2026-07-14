import { and, eq } from 'drizzle-orm';
import type { CoreDb } from '../../db/core/client.js';
import { tenants, tenantDatabases } from '../../db/core/schema.js';
import type { TenantDatabaseRow } from '../../tenancy/tenant-resolver.js';

/**
 * Busca no CORE o tenant ATIVO de um subdomínio, junto das credenciais
 * (cifradas) do seu banco. Retorna `null` se não houver tenant ativo.
 */
export async function findActiveTenantDatabaseBySubdomain(
  coreDb: CoreDb,
  subdomain: string,
): Promise<TenantDatabaseRow | null> {
  const rows = await coreDb
    .select({
      tenantId: tenants.id,
      subdomain: tenants.subdominio,
      host: tenantDatabases.host,
      port: tenantDatabases.porta,
      database: tenantDatabases.dbname,
      user: tenantDatabases.usuario,
      passwordCipher: tenantDatabases.senhaCifrada,
    })
    .from(tenants)
    .innerJoin(tenantDatabases, eq(tenantDatabases.tenantId, tenants.id))
    .where(and(eq(tenants.subdominio, subdomain), eq(tenants.status, 'ativo')))
    .limit(1);

  return rows[0] ?? null;
}
