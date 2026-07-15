import type { MetricGranularity } from '@wz/shared';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const PERIOD_MS: Record<MetricGranularity, number> = {
  hour: HOUR_MS,
  day: DAY_MS,
};

/**
 * Trunca um instante para o início da sua janela (UTC).
 *
 * É o que torna a ingestão **idempotente**: o produto reporta o valor de uma
 * janela, e reenviar a mesma janela sobrescreve em vez de duplicar. Sempre UTC,
 * para o bucket não mudar com o fuso de quem reporta.
 */
export function toBucket(date: Date, granularity: MetricGranularity): Date {
  const time = date.getTime();
  if (Number.isNaN(time)) {
    throw new Error('Data inválida para bucket de métrica');
  }
  const period = PERIOD_MS[granularity];
  return new Date(Math.floor(time / period) * period);
}

export interface BucketWindow {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Janela retroativa de `periods` buckets terminando no bucket de `now`
 * (inclusiva nas duas pontas).
 */
export function bucketRange(
  now: Date,
  granularity: MetricGranularity,
  periods: number,
): BucketWindow {
  if (!Number.isInteger(periods) || periods < 1) {
    throw new Error('Quantidade de períodos deve ser um inteiro positivo');
  }
  const to = toBucket(now, granularity);
  const from = new Date(to.getTime() - (periods - 1) * PERIOD_MS[granularity]);
  return { from, to };
}
