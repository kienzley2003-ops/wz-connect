import { describe, it, expect, vi } from 'vitest';
import {
  provisionTenant,
  TenantNotFoundError,
  TenantAlreadyActiveError,
  type ProvisioningDeps,
  type TenantRecord,
} from './provisioning.service.js';
import { UnknownPlacementError, type Placement } from './placement.js';

const placement: Placement = {
  name: 'default',
  host: 'localhost',
  port: 5435,
  user: 'wz_connect',
  password: 'senha-clara',
};

function tenant(overrides: Partial<TenantRecord> = {}): TenantRecord {
  return {
    id: 't-1',
    slug: 'acme',
    subdominio: 'acme',
    status: 'provisionando',
    dbPlacement: 'default',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ProvisioningDeps> = {}): ProvisioningDeps {
  return {
    findTenant: vi.fn(async () => tenant()),
    resolvePlacement: vi.fn(() => placement),
    createDatabase: vi.fn(async () => 'created' as const),
    migrateTenantDb: vi.fn(async () => {}),
    seedTenantDb: vi.fn(async () => {}),
    // Fake opaco de propósito: se ecoasse o texto puro, a asserção de
    // "não vaza a senha" passaria por acidente.
    encrypt: vi.fn((plain: string) => `v1:${Buffer.from(plain).toString('base64')}`),
    saveCredentials: vi.fn(async () => {}),
    activateTenant: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('provisionTenant', () => {
  it('provisiona do zero: cria banco, migra, seeda, registra credenciais e ativa', async () => {
    const deps = makeDeps();
    const result = await provisionTenant(deps, 't-1');

    expect(result).toEqual({
      tenantId: 't-1',
      database: 'wz_tenant_acme',
      placement: 'default',
      created: true,
    });
    expect(deps.createDatabase).toHaveBeenCalledWith(placement, 'wz_tenant_acme');
    expect(deps.migrateTenantDb).toHaveBeenCalledWith(placement, 'wz_tenant_acme');
    expect(deps.seedTenantDb).toHaveBeenCalledWith(placement, 'wz_tenant_acme', tenant());
    expect(deps.activateTenant).toHaveBeenCalledWith('t-1');
  });

  it('grava a senha CIFRADA, nunca em texto puro', async () => {
    const deps = makeDeps();
    await provisionTenant(deps, 't-1');

    const creds = (deps.saveCredentials as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(deps.encrypt).toHaveBeenCalledWith('senha-clara');
    expect(creds.senhaCifrada).toBe(`v1:${Buffer.from('senha-clara').toString('base64')}`);
    expect(JSON.stringify(creds)).not.toContain('senha-clara');
    expect(creds).toMatchObject({
      host: 'localhost',
      porta: 5435,
      dbname: 'wz_tenant_acme',
      usuario: 'wz_connect',
      servidor: 'default',
    });
  });

  it('é idempotente quando o banco já existe: migra mesmo assim', async () => {
    const deps = makeDeps({ createDatabase: vi.fn(async () => 'already_exists' as const) });
    const result = await provisionTenant(deps, 't-1');

    expect(result.created).toBe(false);
    expect(deps.migrateTenantDb).toHaveBeenCalled();
    expect(deps.activateTenant).toHaveBeenCalled();
  });

  it('recusa tenant inexistente sem criar nada', async () => {
    const deps = makeDeps({ findTenant: vi.fn(async () => null) });
    await expect(provisionTenant(deps, 'fantasma')).rejects.toBeInstanceOf(TenantNotFoundError);
    expect(deps.createDatabase).not.toHaveBeenCalled();
  });

  it('recusa tenant já ativo (evita reprovisionar por engano)', async () => {
    const deps = makeDeps({ findTenant: vi.fn(async () => tenant({ status: 'ativo' })) });
    await expect(provisionTenant(deps, 't-1')).rejects.toBeInstanceOf(TenantAlreadyActiveError);
    expect(deps.createDatabase).not.toHaveBeenCalled();
  });

  it('recusa slug inseguro antes de tocar no banco', async () => {
    const deps = makeDeps({ findTenant: vi.fn(async () => tenant({ slug: 'acme; DROP' })) });
    await expect(provisionTenant(deps, 't-1')).rejects.toThrow(/slug/i);
    expect(deps.createDatabase).not.toHaveBeenCalled();
  });

  it('propaga placement desconhecido sem criar banco', async () => {
    const deps = makeDeps({
      resolvePlacement: vi.fn(() => {
        throw new UnknownPlacementError('fantasma');
      }),
    });
    await expect(provisionTenant(deps, 't-1')).rejects.toBeInstanceOf(UnknownPlacementError);
    expect(deps.createDatabase).not.toHaveBeenCalled();
  });

  it('não ativa o tenant se a migração falhar', async () => {
    const deps = makeDeps({
      migrateTenantDb: vi.fn(async () => {
        throw new Error('migração falhou');
      }),
    });
    await expect(provisionTenant(deps, 't-1')).rejects.toThrow(/migração falhou/);
    expect(deps.activateTenant).not.toHaveBeenCalled();
    expect(deps.saveCredentials).not.toHaveBeenCalled();
  });
});
