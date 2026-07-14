import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerTenantResolution } from './tenant-resolution.plugin.js';
import { getTenantContext, type TenantContext, type TenantDb } from './tenant-context.js';
import { TenantNotFoundError } from './errors.js';

function buildTestApp(resolve: (subdomain: string) => Promise<TenantContext>) {
  const app = Fastify();
  registerTenantResolution(app, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: { resolve } as any,
    baseDomain: 'wzconnect.com',
    isExempt: (url) => url.startsWith('/health'),
  });
  app.get('/health', async () => ({ ok: true }));
  app.get('/whoami', async () => {
    const ctx = getTenantContext();
    return { tenantId: ctx.tenantId, subdomain: ctx.subdomain };
  });
  return app;
}

const okResolve = async (subdomain: string): Promise<TenantContext> => ({
  tenantId: `id-${subdomain}`,
  subdomain,
  db: {} as TenantDb,
});

describe('registerTenantResolution', () => {
  it('injeta o contexto do tenant e o handler o enxerga', async () => {
    const app = buildTestApp(okResolve);
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { host: 'acme.wzconnect.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tenantId: 'id-acme', subdomain: 'acme' });
    await app.close();
  });

  it('ignora rotas isentas (ex.: /health)', async () => {
    const app = buildTestApp(async () => {
      throw new Error('não deveria resolver');
    });
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: 'x.com' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('retorna 400 quando não há subdomínio', async () => {
    const app = buildTestApp(okResolve);
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { host: 'wzconnect.com' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('retorna 404 quando o tenant não existe', async () => {
    const app = buildTestApp(async (subdomain) => {
      throw new TenantNotFoundError(subdomain);
    });
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { host: 'fantasma.wzconnect.com' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('propaga erros inesperados como 500', async () => {
    const app = buildTestApp(async () => {
      throw new Error('falha de infra');
    });
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { host: 'acme.wzconnect.com' },
    });

    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
