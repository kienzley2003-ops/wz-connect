import type { FastifyInstance } from 'fastify';
import { createAuthGuard } from '../core/auth/auth.guard.js';
import {
  AccountLockedError,
  InvalidCredentialsError,
  UserInactiveError,
} from '../core/auth/auth.service.js';
import type { AuthModule } from '../core/auth/create-auth.js';

/** Registra as rotas de autenticação global (ADR-008). São isentas de tenant. */
export function registerAuthRoutes(app: FastifyInstance, auth: AuthModule): void {
  app.post('/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | undefined;
    if (!body?.email || !body?.password) {
      return reply.code(400).send({ error: 'email_password_required' });
    }

    try {
      const result = await auth.authService.login(body.email, body.password);
      return { token: result.token };
    } catch (err) {
      if (err instanceof AccountLockedError) {
        return reply.code(423).send({ error: 'account_locked' });
      }
      if (err instanceof InvalidCredentialsError) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      if (err instanceof UserInactiveError) {
        return reply.code(403).send({ error: 'user_inactive' });
      }
      throw err;
    }
  });

  const guard = createAuthGuard({
    verifyToken: auth.verifyToken,
    getActiveSessionId: auth.getActiveSessionId,
  });

  app.get('/auth/me', { preHandler: guard }, async (request, reply) => {
    const profile = await auth.getUserProfile(request.authUser!.id);
    if (!profile) {
      return reply.code(404).send({ error: 'user_not_found' });
    }
    return profile;
  });

  app.post('/auth/logout', { preHandler: guard }, async (request) => {
    await auth.logout(request.authUser!.id);
    return { ok: true };
  });

  app.get('/.well-known/jwks.json', async () => auth.jwks());
}
