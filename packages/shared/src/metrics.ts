import { z } from 'zod';

/**
 * Granularidade da janela de agregação. O produto reporta o **valor da janela**,
 * não um evento avulso — é o que mantém a ingestão idempotente (reenviar a mesma
 * janela sobrescreve em vez de somar duas vezes).
 */
export const METRIC_GRANULARITIES = ['hour', 'day'] as const;
export type MetricGranularity = (typeof METRIC_GRANULARITIES)[number];

/** Um ponto de métrica de um módulo, numa janela. */
export const metricSnapshotSchema = z.object({
  /** Chave do módulo que reporta (ex.: 'masterfila'). */
  module: z.string().min(1).max(64),
  /** Nome da métrica (ex.: 'tickets_atendidos'). */
  metric: z.string().min(1).max(64),
  /** Valor acumulado na janela. */
  value: z.number().finite(),
  /** Início da janela (ISO 8601). Normalizado pelo servidor. */
  bucket: z.string().datetime(),
  granularity: z.enum(METRIC_GRANULARITIES),
});
export type MetricSnapshot = z.infer<typeof metricSnapshotSchema>;

/** Payload de `POST /metrics/ingest`. */
export const metricsIngestSchema = z.object({
  snapshots: z.array(metricSnapshotSchema).min(1).max(500),
});
export type MetricsIngestInput = z.infer<typeof metricsIngestSchema>;

/** Uma métrica consolidada no dashboard. */
export interface DashboardMetric {
  readonly module: string;
  readonly metric: string;
  readonly total: number;
  readonly points: number;
  readonly lastBucket: string | null;
}

/** Resposta de `GET /dashboard`. */
export interface DashboardResponse {
  readonly tenant: string;
  readonly from: string;
  readonly to: string;
  readonly metrics: DashboardMetric[];
}
