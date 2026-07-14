import { describe, it, expect } from 'vitest';
import {
  TenantConnectionRegistry,
  type TenantConnection,
  type TenantDbCredentials,
} from './tenant-connection.registry.js';
import type { TenantDb } from './tenant-context.js';

function creds(tenantId: string): TenantDbCredentials {
  return {
    tenantId,
    host: 'localhost',
    port: 5432,
    database: `wz_tenant_${tenantId}`,
    user: 'u',
    password: 'p',
  };
}

function makeFactory() {
  const created: string[] = [];
  const closed: string[] = [];
  const factory = (c: TenantDbCredentials): TenantConnection => {
    created.push(c.tenantId);
    return {
      db: {} as TenantDb,
      close: async () => {
        closed.push(c.tenantId);
      },
    };
  };
  return { factory, created, closed };
}

describe('TenantConnectionRegistry', () => {
  it('cria a conexão no primeiro acesso (cache miss)', () => {
    const { factory, created } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 5, factory });

    reg.get(creds('a'));

    expect(created).toEqual(['a']);
    expect(reg.size()).toBe(1);
  });

  it('reutiliza a conexão em acessos seguintes (cache hit)', () => {
    const { factory, created } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 5, factory });

    const first = reg.get(creds('a'));
    const second = reg.get(creds('a'));

    expect(second).toBe(first);
    expect(created).toEqual(['a']);
  });

  it('nunca ultrapassa maxConnections (eviction)', () => {
    const { factory } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 2, factory });

    reg.get(creds('a'));
    reg.get(creds('b'));
    reg.get(creds('c'));

    expect(reg.size()).toBe(2);
  });

  it('remove o menos recentemente usado (LRU) e o fecha', () => {
    const { factory, closed } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 2, factory });

    reg.get(creds('a'));
    reg.get(creds('b'));
    reg.get(creds('c')); // deve remover 'a' (LRU)

    expect(closed).toEqual(['a']);
  });

  it('acessar renova a recência (LRU move-to-front)', () => {
    const { factory, closed } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 2, factory });

    reg.get(creds('a'));
    reg.get(creds('b'));
    reg.get(creds('a')); // 'a' volta a ser o mais recente
    reg.get(creds('c')); // agora o LRU é 'b'

    expect(closed).toEqual(['b']);
  });

  it('close(tenantId) fecha e remove a conexão', async () => {
    const { factory, closed } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 5, factory });

    reg.get(creds('a'));
    await reg.close('a');

    expect(closed).toEqual(['a']);
    expect(reg.size()).toBe(0);
  });

  it('close(tenantId) inexistente é no-op', async () => {
    const { factory } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 5, factory });

    await expect(reg.close('nao-existe')).resolves.toBeUndefined();
  });

  it('closeAll fecha todas e esvazia o registry', async () => {
    const { factory, closed } = makeFactory();
    const reg = new TenantConnectionRegistry({ maxConnections: 5, factory });

    reg.get(creds('a'));
    reg.get(creds('b'));
    await reg.closeAll();

    expect(closed.sort()).toEqual(['a', 'b']);
    expect(reg.size()).toBe(0);
  });
});
