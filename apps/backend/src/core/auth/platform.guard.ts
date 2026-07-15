import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PlatformRole } from '@wz/shared';

/**
 * preHandler que restringe uma rota a papéis de **plataforma** (WZ), lidos do
 * claim `prole` do token. Protege operações que atravessam tenants — criar e
 * provisionar empresas, por exemplo.
 *
 * Requer que o guard de autenticação já tenha rodado (`request.authUser`).
 */
export function createPlatformGuard(allowed: readonly PlatformRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authUser = request.authUser;
    if (!authUser) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    if (!authUser.prole || !allowed.includes(authUser.prole as PlatformRole)) {
      await reply.code(403).send({ error: 'platform_role_required' });
    }
  };
}
