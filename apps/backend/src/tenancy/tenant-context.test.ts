import { describe, it, expect } from 'vitest';
import {
  runWithTenant,
  runTenantScope,
  setTenantContext,
  getTenantContext,
  getTenantDb,
  tryGetTenantContext,
  type TenantContext,
  type TenantDb,
} from './tenant-context.js';

const fakeDb = {} as TenantDb;
const ctx: TenantContext = { tenantId: 't-1', subdomain: 'acme', db: fakeDb };

describe('tenant-context', () => {
  it('disponibiliza o contexto dentro de runWithTenant', () => {
    runWithTenant(ctx, () => {
      expect(getTenantContext()).toBe(ctx);
      expect(getTenantDb()).toBe(fakeDb);
    });
  });

  it('lança erro ao acessar o contexto fora de runWithTenant', () => {
    expect(() => getTenantContext()).toThrow(/tenant/i);
    expect(() => getTenantDb()).toThrow(/tenant/i);
  });

  it('tryGetTenantContext retorna undefined fora do contexto', () => {
    expect(tryGetTenantContext()).toBeUndefined();
  });

  it('retorna o valor da função executada', () => {
    const result = runWithTenant(ctx, () => 42);
    expect(result).toBe(42);
  });

  it('runTenantScope abre um escopo e setTenantContext preenche o contexto', () => {
    runTenantScope(() => {
      expect(tryGetTenantContext()).toBeUndefined();
      setTenantContext(ctx);
      expect(getTenantContext()).toBe(ctx);
      expect(getTenantDb()).toBe(fakeDb);
    });
  });

  it('setTenantContext fora de um escopo lança erro', () => {
    expect(() => setTenantContext(ctx)).toThrow(/escopo/i);
  });

  it('isola contextos aninhados', async () => {
    const ctxB: TenantContext = { tenantId: 't-2', subdomain: 'beta', db: fakeDb };
    await runWithTenant(ctx, async () => {
      expect(getTenantContext().tenantId).toBe('t-1');
      await runWithTenant(ctxB, async () => {
        expect(getTenantContext().tenantId).toBe('t-2');
      });
      expect(getTenantContext().tenantId).toBe('t-1');
    });
  });
});
