import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AccountLockedError,
  InvalidCredentialsError,
  TenantAccessDeniedError,
  UserInactiveError,
} from '../core/auth/auth.service.js';
import type { AuthModule } from '../core/auth/create-auth.js';

export interface AuthRoutesDeps {
  /** Guard de autenticação já composto (com binding de subdomínio). */
  readonly guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** Subdomínio da request: escopa o login ao tenant quando presente. */
  readonly getSubdomain: (request: FastifyRequest) => string | null;
}

/** Registra as rotas de autenticação global (ADR-008). São isentas de tenant. */
export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthModule,
  deps: AuthRoutesDeps,
): void {
  app.post('/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | undefined;
    if (!body?.email || !body?.password) {
      return reply.code(400).send({ error: 'email_password_required' });
    }

    // Login em subdomínio de tenant é escopado; no domínio base é de plataforma.
    const subdomain = deps.getSubdomain(request) ?? undefined;

    try {
      const result = await auth.authService.login(body.email, body.password, subdomain);
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
      if (err instanceof TenantAccessDeniedError) {
        return reply.code(403).send({ error: 'tenant_access_denied', subdomain: err.subdomain });
      }
      throw err;
    }
  });

  app.get('/auth/me', { preHandler: deps.guard }, async (request, reply) => {
    const authUser = request.authUser!;
    const profile = await auth.getUserProfile(authUser.id);
    if (!profile) {
      return reply.code(404).send({ error: 'user_not_found' });
    }
    return {
      ...profile,
      tenant: authUser.tnt ?? null,
      roles: authUser.roles,
      mods: authUser.mods,
    };
  });

  app.post('/auth/logout', { preHandler: deps.guard }, async (request) => {
    await auth.logout(request.authUser!.id);
    return { ok: true };
  });

  app.get('/.well-known/jwks.json', async () => auth.jwks());
}
