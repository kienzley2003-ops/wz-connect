import { describe, it, expect, vi } from 'vitest';
import { TenantResolver, type TenantDatabaseRow } from './tenant-resolver.js';
import { TenantConnectionRegistry, type TenantConnection } from './tenant-connection.registry.js';
import { TenantNotFoundError } from './errors.js';
import type { TenantDb } from './tenant-context.js';

function row(overrides: Partial<TenantDatabaseRow> = {}): TenantDatabaseRow {
  return {
    tenantId: 't-1',
    subdomain: 'acme',
    host: 'localhost',
    port: 5432,
    database: 'wz_tenant_acme',
    user: 'u',
    passwordCipher: 'v1:iv:ct:tag',
    ...overrides,
  };
}

function fakeRegistry() {
  const conn: TenantConnection = { db: {} as TenantDb, close: async () => {} };
  return new TenantConnectionRegistry({ maxConnections: 5, factory: () => conn });
}

describe('TenantResolver', () => {
  it('resolve um subdomínio conhecido para um contexto de tenant', async () => {
    const lookup = vi.fn(async () => row());
    const decrypt = vi.fn(() => 'senha-decifrada');
    const resolver = new TenantResolver({
      lookup,
      decrypt,
      registry: fakeRegistry(),
      cacheTtlMs: 1000,
      now: () => 0,
    });

    const ctx = await resolver.resolve('acme');

    expect(ctx.tenantId).toBe('t-1');
    expect(ctx.subdomain).toBe('acme');
    expect(decrypt).toHaveBeenCalledWith('v1:iv:ct:tag');
  });

  it('lança TenantNotFoundError para subdomínio desconhecido', async () => {
    const resolver = new TenantResolver({
      lookup: async () => null,
      decrypt: () => '',
      registry: fakeRegistry(),
      cacheTtlMs: 1000,
      now: () => 0,
    });

    await expect(resolver.resolve('fantasma')).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('cacheia o lookup dentro do TTL (não consulta o CORE de novo)', async () => {
    const lookup = vi.fn(async () => row());
    let clock = 0;
    const resolver = new TenantResolver({
      lookup,
      decrypt: () => 'x',
      registry: fakeRegistry(),
      cacheTtlMs: 1000,
      now: () => clock,
    });

    await resolver.resolve('acme');
    clock = 500;
    await resolver.resolve('acme');

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('reconsulta o CORE após expirar o TTL', async () => {
    const lookup = vi.fn(async () => row());
    let clock = 0;
    const resolver = new TenantResolver({
      lookup,
      decrypt: () => 'x',
      registry: fakeRegistry(),
      cacheTtlMs: 1000,
      now: () => clock,
    });

    await resolver.resolve('acme');
    clock = 1500;
    await resolver.resolve('acme');

    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('invalidate remove a entrada do cache', async () => {
    const lookup = vi.fn(async () => row());
    const resolver = new TenantResolver({
      lookup,
      decrypt: () => 'x',
      registry: fakeRegistry(),
      cacheTtlMs: 10_000,
      now: () => 0,
    });

    await resolver.resolve('acme');
    resolver.invalidate('acme');
    await resolver.resolve('acme');

    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
