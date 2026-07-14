import type { HealthResponse } from '@wz/shared';

export interface HealthDeps {
  readonly service: string;
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly now: Date;
  readonly coreDbHealthy: boolean;
}

/**
 * Monta o payload de health check. Função pura: toda dependência
 * (relógio, uptime, estado do banco) entra por parâmetro.
 */
export function buildHealth(deps: HealthDeps): HealthResponse {
  return {
    status: deps.coreDbHealthy ? 'ok' : 'degraded',
    service: deps.service,
    version: deps.version,
    uptimeSeconds: deps.uptimeSeconds,
    timestamp: deps.now.toISOString(),
  };
}
