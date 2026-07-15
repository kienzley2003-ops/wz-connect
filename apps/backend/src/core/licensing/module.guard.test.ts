import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createModuleGuard } from './module.guard.js';

function buildApp(mods: string[] | null) {
  const app = Fastify();
  if (mods) {
    app.addHook('onRequest', async (request) => {
      request.authUser = { id: 'u1', sid: 's1', tnt: 'acme', roles: ['org_admin'], mods };
    });
  }
  app.get('/masterfila/filas', { preHandler: createModuleGuard('masterfila') }, async () => ({
    ok: true,
  }));
  return app;
}

const call = (app: ReturnType<typeof buildApp>) =>
  app.inject({ method: 'GET', url: '/masterfila/filas' });

describe('createModuleGuard', () => {
  it('permite quando o módulo está habilitado para o tenant', async () => {
    const app = buildApp(['masterfila']);
    const res = await call(app);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('responde 403 module_not_enabled quando o tenant não contratou o módulo', async () => {
    const app = buildApp(['agenda']);
    const res = await call(app);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'module_not_enabled', module: 'masterfila' });
    await app.close();
  });

  it('responde 401 quando a request não está autenticada', async () => {
    const app = buildApp(null);
    const res = await call(app);
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
