import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * preHandler que bloqueia acesso a um módulo não contratado pelo tenant (ADR-007).
 *
 * Usa o claim `mods` do token (assinado) como caminho rápido, sem ida ao CORE.
 * Consequência: mudanças de módulo só valem para o tenant após novo login/refresh.
 * Requer que o guard de autenticação já tenha rodado (`request.authUser`).
 */
export function createModuleGuard(moduleKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authUser = request.authUser;
    if (!authUser) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    if (!authUser.mods.includes(moduleKey)) {
      await reply.code(403).send({ error: 'module_not_enabled', module: moduleKey });
    }
  };
}
