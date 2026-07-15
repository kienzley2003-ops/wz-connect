import { and, eq } from 'drizzle-orm';
import type { CoreDb } from '../../db/core/client.js';
import { tenants, memberships, tenantModules, modules, plans } from '../../db/core/schema.js';
import type { TenantScope } from '../auth/auth.service.js';
import { resolveEntitlements, type Entitlements, type PlanLimitValue } from './entitlements.js';
import { diffModules, type ModulesDiff } from './module-diff.js';

/** Chaves dos módulos habilitados para um tenant. */
async function listEnabledModuleKeys(coreDb: CoreDb, tenantId: string): Promise<string[]> {
  const rows = await coreDb
    .select({ chave: modules.chave })
    .from(tenantModules)
    .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
    .where(eq(tenantModules.tenantId, tenantId));
  return rows.map((r) => r.chave);
}

/**
 * Escopo do usuário num tenant: exige tenant ativo + membership.
 * Retorna `null` quando não há acesso (usado para negar o login escopado).
 */
export async function resolveTenantScope(
  coreDb: CoreDb,
  userId: string,
  subdomain: string,
): Promise<TenantScope | null> {
  const [row] = await coreDb
    .select({
      tenantId: tenants.id,
      subdomain: tenants.subdominio,
      role: memberships.role,
    })
    .from(tenants)
    .innerJoin(
      memberships,
      and(eq(memberships.tenantId, tenants.id), eq(memberships.userId, userId)),
    )
    .where(and(eq(tenants.subdominio, subdomain), eq(tenants.status, 'ativo')))
    .limit(1);

  if (!row) return null;

  return {
    tenantId: row.tenantId,
    subdomain: row.subdomain,
    roles: [row.role],
    mods: await listEnabledModuleKeys(coreDb, row.tenantId),
  };
}

/** Catálogo de módulos conhecidos pelo CORE (console de administração). */
export async function listModuleCatalog(
  coreDb: CoreDb,
): Promise<Array<{ chave: string; nome: string }>> {
  return coreDb.select({ chave: modules.chave, nome: modules.nome }).from(modules);
}

/** Módulos habilitados de um tenant, por chave. */
export async function listTenantModules(coreDb: CoreDb, tenantId: string): Promise<string[]> {
  return listEnabledModuleKeys(coreDb, tenantId);
}

/**
 * Aplica o estado desejado de módulos de um tenant (habilita/desabilita).
 * O diff é calculado por `diffModules`; aqui só há I/O.
 */
export async function setTenantModules(
  coreDb: CoreDb,
  tenantId: string,
  desired: readonly string[],
): Promise<ModulesDiff> {
  const catalog = await listModuleCatalog(coreDb);
  const current = await listEnabledModuleKeys(coreDb, tenantId);
  const diff = diffModules({ current, desired, catalog: catalog.map((m) => m.chave) });

  for (const chave of diff.toEnable) {
    const [mod] = await coreDb.select().from(modules).where(eq(modules.chave, chave)).limit(1);
    if (mod) {
      await coreDb
        .insert(tenantModules)
        .values({ tenantId, moduleId: mod.id })
        .onConflictDoNothing();
    }
  }

  for (const chave of diff.toDisable) {
    const [mod] = await coreDb.select().from(modules).where(eq(modules.chave, chave)).limit(1);
    if (mod) {
      await coreDb
        .delete(tenantModules)
        .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, mod.id)));
    }
  }

  return diff;
}

/** Entitlements efetivos de um tenant: limites do plano + módulos habilitados. */
export async function getTenantEntitlements(
  coreDb: CoreDb,
  subdomain: string,
): Promise<Entitlements | null> {
  const [row] = await coreDb
    .select({ tenantId: tenants.id, limites: plans.limites })
    .from(tenants)
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(and(eq(tenants.subdominio, subdomain), eq(tenants.status, 'ativo')))
    .limit(1);

  if (!row) return null;

  return resolveEntitlements({
    planLimits: (row.limites as Record<string, PlanLimitValue> | null) ?? null,
    enabledModules: await listEnabledModuleKeys(coreDb, row.tenantId),
  });
}
