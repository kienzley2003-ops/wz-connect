import { describe, it, expect, vi } from 'vitest';
import { migrateAllTenants, type TenantMigrationTarget } from './tenant-migrator.js';

const targets: TenantMigrationTarget[] = [
  { tenantId: 't1', subdomain: 'acme' },
  { tenantId: 't2', subdomain: 'beta' },
  { tenantId: 't3', subdomain: 'gama' },
];

describe('migrateAllTenants', () => {
  it('migra todos os tenants e reporta sucesso', async () => {
    const migrateOne = vi.fn(async () => {});
    const outcomes = await migrateAllTenants({ listTargets: async () => targets, migrateOne });

    expect(migrateOne).toHaveBeenCalledTimes(3);
    expect(outcomes.map((o) => o.status)).toEqual(['ok', 'ok', 'ok']);
    expect(outcomes.map((o) => o.subdomain)).toEqual(['acme', 'beta', 'gama']);
  });

  it('falha em um tenant não bloqueia os demais', async () => {
    const migrateOne = vi.fn(async (t: TenantMigrationTarget) => {
      if (t.subdomain === 'beta') throw new Error('coluna inexistente');
    });

    const outcomes = await migrateAllTenants({ listTargets: async () => targets, migrateOne });

    expect(migrateOne).toHaveBeenCalledTimes(3);
    expect(outcomes.map((o) => o.status)).toEqual(['ok', 'failed', 'ok']);
    expect(outcomes[1]?.error).toMatch(/coluna inexistente/);
  });

  it('retorna vazio quando não há tenants', async () => {
    const outcomes = await migrateAllTenants({
      listTargets: async () => [],
      migrateOne: vi.fn(),
    });
    expect(outcomes).toEqual([]);
  });

  it('reporta progresso por tenant', async () => {
    const onProgress = vi.fn();
    await migrateAllTenants({
      listTargets: async () => targets,
      migrateOne: async () => {},
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]![0]).toMatchObject({ subdomain: 'acme', status: 'ok' });
  });

  it('captura erro não-Error como texto', async () => {
    const outcomes = await migrateAllTenants({
      listTargets: async () => [targets[0]!],
      migrateOne: async () => {
        throw 'boom';
      },
    });
    expect(outcomes[0]?.status).toBe('failed');
    expect(outcomes[0]?.error).toContain('boom');
  });
});
