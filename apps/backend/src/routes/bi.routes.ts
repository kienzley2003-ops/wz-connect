import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  metricsIngestSchema,
  METRIC_GRANULARITIES,
  type DashboardResponse,
  type MetricGranularity,
} from '@wz/shared';
import type { CoreDb } from '../db/core/client.js';
import { findActiveTenantDatabaseBySubdomain } from '../core/tenants/tenant.repository.js';
import { upsertSnapshots, listSnapshots } from '../core/bi/bi.repository.js';
import { summarize } from '../core/bi/aggregate.js';
import { bucketRange } from '../core/bi/bucketing.js';
import { createModuleGuard } from '../core/licensing/module.guard.js';

export interface BiRoutesDeps {
  readonly guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  readonly coreDb: CoreDb;
  /** Relógio injetável (facilita testes de janela). */
  readonly now?: () => Date;
}

const DEFAULT_PERIODS: Record<MetricGranularity, number> = { hour: 24, day: 30 };

/**
 * Rotas de BI (ADR-013). Escopadas ao tenant do token (`tnt`).
 *
 * O tenant vem do **token assinado**, nunca do corpo: assim um produto não
 * consegue reportar métrica em nome de outra empresa.
 */
export function registerBiRoutes(app: FastifyInstance, deps: BiRoutesDeps): void {
  const now = deps.now ?? (() => new Date());

  const resolveTenantId = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> => {
    const tnt = request.authUser?.tnt;
    if (!tnt) {
      await reply.code(400).send({ error: 'tenant_scope_required' });
      return null;
    }
    const row = await findActiveTenantDatabaseBySubdomain(deps.coreDb, tnt);
    if (!row) {
      await reply.code(404).send({ error: 'tenant_not_found' });
      return null;
    }
    return row.tenantId;
  };

  /**
   * Ingestão por push. Exige o guard de módulo: só um módulo contratado pelo
   * tenant pode reportar métricas dele.
   */
  app.post('/metrics/ingest', { preHandler: deps.guard }, async (request, reply) => {
    const parsed = metricsIngestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.issues });
    }

    const authUser = request.authUser!;
    const reported = [...new Set(parsed.data.snapshots.map((s) => s.module))];
    const naoContratado = reported.filter((m) => !authUser.mods.includes(m));
    if (naoContratado.length > 0) {
      return reply.code(403).send({ error: 'module_not_enabled', modules: naoContratado });
    }

    const tenantId = await resolveTenantId(request, reply);
    if (!tenantId) return reply;

    const count = await upsertSnapshots(deps.coreDb, tenantId, parsed.data.snapshots);
    return reply.code(202).send({ ingested: count });
  });

  /** Painel consolidado multi-módulo do tenant. */
  app.get('/dashboard', { preHandler: deps.guard }, async (request, reply) => {
    const query = request.query as { granularity?: string; periods?: string };
    const granularity = (query.granularity ?? 'hour') as MetricGranularity;
    if (!METRIC_GRANULARITIES.includes(granularity)) {
      return reply.code(400).send({ error: 'invalid_granularity' });
    }
    const periods = query.periods ? Number(query.periods) : DEFAULT_PERIODS[granularity];
    if (!Number.isInteger(periods) || periods < 1 || periods > 365) {
      return reply.code(400).send({ error: 'invalid_periods' });
    }

    const tenantId = await resolveTenantId(request, reply);
    if (!tenantId) return reply;

    const { from, to } = bucketRange(now(), granularity, periods);
    const snapshots = await listSnapshots(deps.coreDb, tenantId, granularity, from, to);

    const body: DashboardResponse = {
      tenant: request.authUser!.tnt!,
      from: from.toISOString(),
      to: to.toISOString(),
      metrics: summarize(snapshots),
    };
    return body;
  });

  /** Exemplo de rota de BI restrita a um módulo (mostra o guard combinado). */
  app.get(
    '/dashboard/masterfila',
    { preHandler: [deps.guard, createModuleGuard('masterfila')] },
    async (request, reply) => {
      const tenantId = await resolveTenantId(request, reply);
      if (!tenantId) return reply;
      const { from, to } = bucketRange(now(), 'hour', 24);
      const snapshots = await listSnapshots(deps.coreDb, tenantId, 'hour', from, to);
      return {
        module: 'masterfila',
        metrics: summarize(snapshots.filter((s) => s.module === 'masterfila')),
      };
    },
  );
}
