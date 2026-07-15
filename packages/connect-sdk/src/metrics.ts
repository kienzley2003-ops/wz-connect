import type { MetricSnapshot } from '@wz/shared';
import { ConnectApiError } from './types.js';

export interface MetricsClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
}

/**
 * Empurra snapshots de métricas para o Connect (BI por push — ADR-013).
 *
 * Usa o **token do usuário** (o produto reporta no fluxo de uma request real),
 * e o tenant sai do token — nunca do corpo. Reenviar a mesma janela sobrescreve,
 * então reprocessar é seguro.
 *
 * ⚠️ Limite conhecido: um job de fundo, sem usuário, não tem token para reportar.
 * Isso exigiria credencial máquina-a-máquina, deliberadamente não construída
 * (ver emenda do ADR-011).
 *
 * @returns quantos snapshots foram aceitos.
 */
export async function reportMetrics(
  token: string,
  snapshots: readonly MetricSnapshot[],
  options: MetricsClientOptions,
): Promise<number> {
  if (snapshots.length === 0) return 0;

  const url = `${options.baseUrl.replace(/\/$/, '')}/metrics/ingest`;

  let response: Response;
  try {
    response = await options.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ snapshots }),
    });
  } catch (err) {
    throw new ConnectApiError(
      `Falha ao reportar métricas: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new ConnectApiError('Falha ao reportar métricas', response.status);
  }

  const body = (await response.json()) as { ingested: number };
  return body.ingested;
}
