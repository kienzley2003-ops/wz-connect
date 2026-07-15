import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { createAuthGuard, type AuthGuardDeps } from './auth.guard.js';
import type { AccessTokenClaims } from './token.service.js';

function buildApp(deps: AuthGuardDeps) {
  const app = Fastify();
  const guard = createAuthGuard(deps);
  app.get('/protected', { preHandler: guard }, async (request) => ({ user: request.authUser }));
  return app;
}

const validClaims: AccessTokenClaims = { sub: 'user-1', sid: 'sess-1' };

function withTenant(tnt: string | undefined, requestSubdomain: string | null) {
  return buildApp({
    verifyToken: vi.fn(async () => ({ ...validClaims, ...(tnt ? { tnt } : {}) })),
    getActiveSessionId: vi.fn(async () => 'sess-1'),
    getSubdomain: () => requestSubdomain,
  });
}

describe('createAuthGuard', () => {
  it('permite acesso com token e sessão válidos', async () => {
    const app = buildApp({
      verifyToken: vi.fn(async () => validClaims),
      getActiveSessionId: vi.fn(async () => 'sess-1'),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer good' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { id: 'user-1', sid: 'sess-1', roles: [], mods: [] } });
    await app.close();
  });

  it('responde 401 sem header Authorization', async () => {
    const app = buildApp({
      verifyToken: vi.fn(),
      getActiveSessionId: vi.fn(),
    });
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('responde 401 quando o token é inválido', async () => {
    const app = buildApp({
      verifyToken: vi.fn(async () => {
        throw new Error('inválido');
      }),
      getActiveSessionId: vi.fn(),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer bad' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('responde 401 quando a sessão foi invalidada (sid diferente)', async () => {
    const app = buildApp({
      verifyToken: vi.fn(async () => validClaims),
      getActiveSessionId: vi.fn(async () => 'sess-OUTRA'),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer good' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  describe('binding subdomínio × claim tnt (Fase 3)', () => {
    const call = (app: ReturnType<typeof buildApp>) =>
      app.inject({ method: 'GET', url: '/protected', headers: { authorization: 'Bearer good' } });

    it('permite quando o tnt do token bate com o subdomínio da request', async () => {
      const app = withTenant('acme', 'acme');
      expect((await call(app)).statusCode).toBe(200);
      await app.close();
    });

    it('responde 403 ao usar token de outro tenant', async () => {
      const app = withTenant('beta', 'acme');
      const res = await call(app);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('tenant_mismatch');
      await app.close();
    });

    it('responde 403 quando o token não é escopado ao tenant da request', async () => {
      const app = withTenant(undefined, 'acme');
      expect((await call(app)).statusCode).toBe(403);
      await app.close();
    });

    it('não aplica o binding em rotas sem subdomínio (plataforma)', async () => {
      const app = withTenant('acme', null);
      expect((await call(app)).statusCode).toBe(200);
      await app.close();
    });
  });
});
