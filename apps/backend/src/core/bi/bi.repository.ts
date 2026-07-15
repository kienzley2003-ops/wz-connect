import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { MetricGranularity, MetricSnapshot } from '@wz/shared';
import type { CoreDb } from '../../db/core/client.js';
import { metricSnapshots } from '../../db/core/schema.js';
import { toBucket } from './bucketing.js';
import type { StoredSnapshot } from './aggregate.js';

/**
 * Grava snapshots (lado de escrita do CQRS-lite).
 *
 * Upsert na chave (tenant, módulo, métrica, granularidade, bucket): reenviar a
 * mesma janela **sobrescreve** em vez de duplicar, então o produto pode
 * reprocessar sem medo. O bucket é normalizado aqui — o servidor não confia na
 * janela que o cliente mandou.
 */
export async function upsertSnapshots(
  coreDb: CoreDb,
  tenantId: string,
  snapshots: readonly MetricSnapshot[],
): Promise<number> {
  if (snapshots.length === 0) return 0;

  const rows = snapshots.map((s) => ({
    tenantId,
    modulo: s.module,
    metrica: s.metric,
    valor: s.value,
    granularidade: s.granularity,
    bucket: toBucket(new Date(s.bucket), s.granularity),
  }));

  await coreDb
    .insert(metricSnapshots)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        metricSnapshots.tenantId,
        metricSnapshots.modulo,
        metricSnapshots.metrica,
        metricSnapshots.granularidade,
        metricSnapshots.bucket,
      ],
      set: { valor: sql`excluded.valor`, recebidoEm: new Date() },
    });

  return rows.length;
}

/** Snapshots de um tenant numa janela (lado de leitura). */
export async function listSnapshots(
  coreDb: CoreDb,
  tenantId: string,
  granularity: MetricGranularity,
  from: Date,
  to: Date,
): Promise<StoredSnapshot[]> {
  const rows = await coreDb
    .select({
      module: metricSnapshots.modulo,
      metric: metricSnapshots.metrica,
      value: metricSnapshots.valor,
      bucket: metricSnapshots.bucket,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.tenantId, tenantId),
        eq(metricSnapshots.granularidade, granularity),
        gte(metricSnapshots.bucket, from),
        lte(metricSnapshots.bucket, to),
      ),
    );

  return rows;
}
