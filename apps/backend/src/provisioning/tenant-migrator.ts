export interface TenantMigrationTarget {
  readonly tenantId: string;
  readonly subdomain: string;
}

export interface MigrationOutcome {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly status: 'ok' | 'failed';
  readonly error?: string;
}

export interface TenantMigratorDeps {
  /** Tenants ativos a migrar (lidos do CORE). */
  readonly listTargets: () => Promise<TenantMigrationTarget[]>;
  /** Aplica as migrações pendentes no banco de UM tenant. */
  readonly migrateOne: (target: TenantMigrationTarget) => Promise<void>;
  readonly onProgress?: (outcome: MigrationOutcome) => void;
}

/**
 * Orquestrador de migração por tenant (ADR-009).
 *
 * Sequencial e **resiliente**: a falha de um tenant é reportada e não bloqueia
 * os demais — com N bancos, um erro isolado não pode travar o rollout inteiro.
 * Idempotência fica por conta do `migrateOne` (o journal do Drizzle por banco).
 */
export async function migrateAllTenants(deps: TenantMigratorDeps): Promise<MigrationOutcome[]> {
  const targets = await deps.listTargets();
  const outcomes: MigrationOutcome[] = [];

  for (const target of targets) {
    let outcome: MigrationOutcome;
    try {
      await deps.migrateOne(target);
      outcome = { tenantId: target.tenantId, subdomain: target.subdomain, status: 'ok' };
    } catch (err) {
      outcome = {
        tenantId: target.tenantId,
        subdomain: target.subdomain,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
    outcomes.push(outcome);
    deps.onProgress?.(outcome);
  }

  return outcomes;
}
