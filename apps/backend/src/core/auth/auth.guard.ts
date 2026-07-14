import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccessTokenClaims } from './token.service.js';

export interface AuthGuardDeps {
  readonly verifyToken: (token: string) => Promise<AccessTokenClaims>;
  /** Retorna a sessão ativa atual do usuário no CORE (sessão única). */
  readonly getActiveSessionId: (userId: string) => Promise<string | null>;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { id: string; sid: string };
  }
}

/**
 * preHandler que autentica a request via Bearer token (RS256/JWKS) e valida a
 * sessão única (o `sid` do token precisa bater com `sessao_ativa_id` no CORE).
 * Anexa `request.authUser` em caso de sucesso; responde 401 caso contrário.
 */
export function createAuthGuard(deps: AuthGuardDeps) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    let claims: AccessTokenClaims;
    try {
      claims = await deps.verifyToken(header.slice('Bearer '.length));
    } catch {
      await reply.code(401).send({ error: 'invalid_token' });
      return;
    }

    const activeSessionId = await deps.getActiveSessionId(claims.sub);
    if (!activeSessionId || activeSessionId !== claims.sid) {
      await reply.code(401).send({ error: 'session_expired' });
      return;
    }

    request.authUser = { id: claims.sub, sid: claims.sid };
  };
}
