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
    generatePassword: vi.fn(() => 'senha-da-role'),
    ensureRole: vi.fn(async () => {}),
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
  it('provisiona do zero: cria banco, role dedicada, migra, seeda e ativa', async () => {
    const deps = makeDeps();
    const result = await provisionTenant(deps, 't-1');

    expect(result).toMatchObject({
      tenantId: 't-1',
      database: 'wz_tenant_acme',
      placement: 'default',
      created: true,
    });
    expect(deps.createDatabase).toHaveBeenCalledWith(placement, 'wz_tenant_acme');
    expect(deps.ensureRole).toHaveBeenCalledWith(
      placement,
      'wz_tenant_acme',
      'wz_app_acme',
      'senha-da-role',
    );
    expect(deps.activateTenant).toHaveBeenCalledWith('t-1');
  });

  it('migra e seeda COMO a role do tenant, não como o admin do placement', async () => {
    const deps = makeDeps();
    await provisionTenant(deps, 't-1');

    const asTenantRole = {
      name: 'default',
      host: 'localhost',
      port: 5435,
      user: 'wz_app_acme',
      password: 'senha-da-role',
    };
    // Objetos criados pela própria role → sem bagunça de ownership.
    expect(deps.migrateTenantDb).toHaveBeenCalledWith(asTenantRole, 'wz_tenant_acme');
    expect(deps.seedTenantDb).toHaveBeenCalledWith(asTenantRole, 'wz_tenant_acme', tenant());
  });

  it('grava a senha da ROLE cifrada, nunca em texto puro nem a do admin', async () => {
    const deps = makeDeps();
    await provisionTenant(deps, 't-1');

    const creds = (deps.saveCredentials as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(deps.encrypt).toHaveBeenCalledWith('senha-da-role');
    expect(creds.senhaCifrada).toBe(`v1:${Buffer.from('senha-da-role').toString('base64')}`);
    expect(JSON.stringify(creds)).not.toContain('senha-da-role');
    // A credencial do admin do placement nunca é persistida.
    expect(JSON.stringify(creds)).not.toContain('senha-clara');
    expect(creds).toMatchObject({
      host: 'localhost',
      porta: 5435,
      dbname: 'wz_tenant_acme',
      usuario: 'wz_app_acme',
      servidor: 'default',
    });
  });

  it('revela a credencial em texto puro UMA vez, no retorno do provisionamento', async () => {
    const deps = makeDeps();
    const result = await provisionTenant(deps, 't-1');

    expect(result.credentials).toEqual({
      host: 'localhost',
      port: 5435,
      database: 'wz_tenant_acme',
      user: 'wz_app_acme',
      password: 'senha-da-role',
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

  it('gera uma senha nova a cada provisionamento (sem senha fixa)', async () => {
    let n = 0;
    const deps = makeDeps({ generatePassword: vi.fn(() => `senha-${++n}`) });
    const a = await provisionTenant(deps, 't-1');
    const b = await provisionTenant(deps, 't-1');

    expect(a.credentials.password).toBe('senha-1');
    expect(b.credentials.password).toBe('senha-2');
  });
});
