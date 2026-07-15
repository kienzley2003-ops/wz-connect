import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { checkEntitlement, type Entitlements } from '../core/licensing/entitlements.js';

export interface LicensingRoutesDeps {
  readonly guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  readonly getTenantEntitlements: (subdomain: string) => Promise<Entitlements | null>;
}

/**
 * Rotas de licenciamento (Fase 3). Escopadas ao tenant do token (`tnt`),
 * com os limites lidos do CORE a cada consulta (sempre frescos).
 */
export function registerLicensingRoutes(app: FastifyInstance, deps: LicensingRoutesDeps): void {
  const requireTenantEntitlements = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<Entitlements | null> => {
    const tnt = request.authUser?.tnt;
    if (!tnt) {
      await reply.code(400).send({ error: 'tenant_scope_required' });
      return null;
    }
    const entitlements = await deps.getTenantEntitlements(tnt);
    if (!entitlements) {
      await reply.code(404).send({ error: 'tenant_not_found' });
      return null;
    }
    return entitlements;
  };

  /** Entitlements efetivos do tenant (módulos + limites do plano). */
  app.get('/entitlements', { preHandler: deps.guard }, async (request, reply) => {
    const entitlements = await requireTenantEntitlements(request, reply);
    if (!entitlements) return reply;
    return entitlements;
  });

  /** Decide se uma ação é permitida (consumido pelos produtos via SDK). */
  app.post('/entitlements/check', { preHandler: deps.guard }, async (request, reply) => {
    const entitlements = await requireTenantEntitlements(request, reply);
    if (!entitlements) return reply;
    const body = (request.body ?? {}) as { module?: string; feature?: string; usage?: number };
    return checkEntitlement(entitlements, body);
  });
}
