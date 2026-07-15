import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createPlatformGuard } from './platform.guard.js';

function buildApp(prole: string | undefined, authenticated = true) {
  const app = Fastify();
  if (authenticated) {
    app.addHook('onRequest', async (request) => {
      request.authUser = {
        id: 'u1',
        sid: 's1',
        ...(prole ? { prole } : {}),
        roles: [],
        mods: [],
      };
    });
  }
  app.get('/tenants', { preHandler: createPlatformGuard(['platform_super_admin']) }, async () => ({
    ok: true,
  }));
  return app;
}

const call = (app: ReturnType<typeof buildApp>) => app.inject({ method: 'GET', url: '/tenants' });

describe('createPlatformGuard', () => {
  it('permite o papel de plataforma exigido', async () => {
    const app = buildApp('platform_super_admin');
    expect((await call(app)).statusCode).toBe(200);
    await app.close();
  });

  it('responde 403 para usuário comum de tenant (sem prole)', async () => {
    const app = buildApp(undefined);
    const res = await call(app);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'platform_role_required' });
    await app.close();
  });

  it('responde 403 para papel de plataforma insuficiente', async () => {
    const app = buildApp('platform_support');
    expect((await call(app)).statusCode).toBe(403);
    await app.close();
  });

  it('responde 401 quando a request não está autenticada', async () => {
    const app = buildApp(undefined, false);
    expect((await call(app)).statusCode).toBe(401);
    await app.close();
  });

  it('aceita qualquer papel da lista permitida', async () => {
    const app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.authUser = { id: 'u', sid: 's', prole: 'platform_support', roles: [], mods: [] };
    });
    app.get(
      '/x',
      { preHandler: createPlatformGuard(['platform_super_admin', 'platform_support']) },
      async () => ({ ok: true }),
    );
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
