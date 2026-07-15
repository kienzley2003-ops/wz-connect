import { and, eq } from 'drizzle-orm';
import type { CoreDb } from '../../db/core/client.js';
import { tenants, tenantDatabases } from '../../db/core/schema.js';
import type { TenantDatabaseRow } from '../../tenancy/tenant-resolver.js';
import type {
  TenantRecord,
  TenantDbCredentialsRow,
} from '../../provisioning/provisioning.service.js';
import type { TenantMigrationTarget } from '../../provisioning/tenant-migrator.js';

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

// ---------------------------------------------------------------------------
// Provisionamento (Fase 4)
// ---------------------------------------------------------------------------

export async function findTenantById(coreDb: CoreDb, id: string): Promise<TenantRecord | null> {
  const [row] = await coreDb
    .select({
      id: tenants.id,
      slug: tenants.slug,
      subdominio: tenants.subdominio,
      status: tenants.status,
      dbPlacement: tenants.dbPlacement,
    })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  return row ?? null;
}

export interface TenantListItem extends TenantRecord {
  readonly nome: string;
  readonly criadoEm: Date;
}

/** Todas as empresas, para o console de administração. */
export async function listTenants(coreDb: CoreDb): Promise<TenantListItem[]> {
  return coreDb
    .select({
      id: tenants.id,
      nome: tenants.nome,
      slug: tenants.slug,
      subdominio: tenants.subdominio,
      status: tenants.status,
      dbPlacement: tenants.dbPlacement,
      criadoEm: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(tenants.subdominio);
}

export interface CreateTenantInput {
  readonly nome: string;
  readonly slug: string;
  readonly subdominio: string;
  readonly dbPlacement?: string;
  readonly planId?: string;
}

/** Cria o registro do tenant em `provisionando` (o banco vem no provisionamento). */
export async function createTenant(
  coreDb: CoreDb,
  input: CreateTenantInput,
): Promise<TenantRecord> {
  const [row] = await coreDb
    .insert(tenants)
    .values({
      nome: input.nome,
      slug: input.slug,
      subdominio: input.subdominio,
      status: 'provisionando',
      ...(input.dbPlacement ? { dbPlacement: input.dbPlacement } : {}),
      ...(input.planId ? { planId: input.planId } : {}),
    })
    .returning({
      id: tenants.id,
      slug: tenants.slug,
      subdominio: tenants.subdominio,
      status: tenants.status,
      dbPlacement: tenants.dbPlacement,
    });
  if (!row) throw new Error('Falha ao criar o tenant');
  return row;
}

/** Upsert das credenciais (cifradas) do banco do tenant. */
export async function saveTenantCredentials(
  coreDb: CoreDb,
  tenantId: string,
  creds: TenantDbCredentialsRow,
): Promise<void> {
  const [existing] = await coreDb
    .select({ id: tenantDatabases.id })
    .from(tenantDatabases)
    .where(eq(tenantDatabases.tenantId, tenantId))
    .limit(1);

  if (existing) {
    await coreDb
      .update(tenantDatabases)
      .set({ ...creds, updatedAt: new Date() })
      .where(eq(tenantDatabases.id, existing.id));
    return;
  }
  await coreDb.insert(tenantDatabases).values({ tenantId, ...creds });
}

export async function activateTenant(coreDb: CoreDb, tenantId: string): Promise<void> {
  await coreDb
    .update(tenants)
    .set({ status: 'ativo', updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}

/** Tenants ativos a migrar (alvos do tenant-migrator). */
export async function listActiveTenantTargets(coreDb: CoreDb): Promise<TenantMigrationTarget[]> {
  return coreDb
    .select({ tenantId: tenants.id, subdomain: tenants.subdominio })
    .from(tenants)
    .where(eq(tenants.status, 'ativo'));
}

export interface StoredTenantDatabase {
  readonly host: string;
  readonly porta: number;
  readonly dbname: string;
  readonly usuario: string;
  readonly senhaCifrada: string;
  readonly servidor: string;
}

export async function findTenantDatabaseByTenantId(
  coreDb: CoreDb,
  tenantId: string,
): Promise<StoredTenantDatabase | null> {
  const [row] = await coreDb
    .select({
      host: tenantDatabases.host,
      porta: tenantDatabases.porta,
      dbname: tenantDatabases.dbname,
      usuario: tenantDatabases.usuario,
      senhaCifrada: tenantDatabases.senhaCifrada,
      servidor: tenantDatabases.servidor,
    })
    .from(tenantDatabases)
    .where(eq(tenantDatabases.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}
