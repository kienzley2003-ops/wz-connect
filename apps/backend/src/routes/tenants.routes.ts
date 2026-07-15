import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CoreDb } from '../db/core/client.js';
import { createTenant, findTenantById } from '../core/tenants/tenant.repository.js';
import { isSafeSlug } from '../provisioning/tenant-database-name.js';
import { createPlatformGuard } from '../core/auth/platform.guard.js';
import { UnknownPlacementError } from '../provisioning/placement.js';
import {
  provisionTenant,
  TenantAlreadyActiveError,
  TenantNotFoundError,
  type ProvisioningDeps,
} from '../provisioning/provisioning.service.js';

export interface TenantsRoutesDeps {
  readonly guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  readonly coreDb: CoreDb;
  readonly provisioning: ProvisioningDeps;
}

/**
 * Rotas de plataforma para gestão de tenants (Fase 4). Isentas de resolução de
 * tenant (operam sobre o CORE) e restritas a `platform_super_admin`: criar e
 * provisionar empresas atravessa tenants, então não pode ficar ao alcance de um
 * usuário comum autenticado.
 */
export function registerTenantsRoutes(app: FastifyInstance, deps: TenantsRoutesDeps): void {
  const platformGuard = createPlatformGuard(['platform_super_admin']);
  const onlyPlatformAdmin = [deps.guard, platformGuard];

  app.post('/tenants', { preHandler: onlyPlatformAdmin }, async (request, reply) => {
    const body = request.body as
      { nome?: string; slug?: string; subdominio?: string; dbPlacement?: string } | undefined;

    if (!body?.nome || !body?.slug) {
      return reply.code(400).send({ error: 'nome_slug_required' });
    }
    if (!isSafeSlug(body.slug)) {
      return reply.code(400).send({ error: 'invalid_slug', slug: body.slug });
    }

    const tenant = await createTenant(deps.coreDb, {
      nome: body.nome,
      slug: body.slug,
      subdominio: body.subdominio ?? body.slug,
      ...(body.dbPlacement ? { dbPlacement: body.dbPlacement } : {}),
    });
    return reply.code(201).send(tenant);
  });

  app.get('/tenants/:id', { preHandler: onlyPlatformAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await findTenantById(deps.coreDb, id);
    if (!tenant) return reply.code(404).send({ error: 'tenant_not_found' });
    return tenant;
  });

  app.post(
    '/tenants/:id/provisionar',
    { preHandler: onlyPlatformAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        return await provisionTenant(deps.provisioning, id);
      } catch (err) {
        if (err instanceof TenantNotFoundError) {
          return reply.code(404).send({ error: 'tenant_not_found' });
        }
        if (err instanceof TenantAlreadyActiveError) {
          return reply.code(409).send({ error: 'tenant_already_active' });
        }
        if (err instanceof UnknownPlacementError) {
          return reply.code(400).send({ error: 'unknown_placement', placement: err.placement });
        }
        throw err;
      }
    },
  );
}
