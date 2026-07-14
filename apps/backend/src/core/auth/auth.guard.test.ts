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
    expect(res.json()).toEqual({ user: { id: 'user-1', sid: 'sess-1' } });
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
});
