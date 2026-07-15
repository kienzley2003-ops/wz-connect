import { describe, it, expect } from 'vitest';
import { metricSnapshotSchema, metricsIngestSchema } from './metrics.js';

const valid = {
  module: 'masterfila',
  metric: 'tickets_atendidos',
  value: 42,
  bucket: '2026-07-14T13:00:00.000Z',
  granularity: 'hour' as const,
};

describe('metricSnapshotSchema', () => {
  it('aceita um snapshot válido', () => {
    expect(() => metricSnapshotSchema.parse(valid)).not.toThrow();
  });

  it('aceita valor zero e negativo (métricas podem cair)', () => {
    expect(() => metricSnapshotSchema.parse({ ...valid, value: 0 })).not.toThrow();
    expect(() => metricSnapshotSchema.parse({ ...valid, value: -3 })).not.toThrow();
  });

  it('rejeita valor não numérico', () => {
    expect(() => metricSnapshotSchema.parse({ ...valid, value: 'muitos' })).toThrow();
  });

  it('rejeita valor não finito (NaN/Infinity quebrariam a soma)', () => {
    expect(() => metricSnapshotSchema.parse({ ...valid, value: Number.NaN })).toThrow();
    expect(() =>
      metricSnapshotSchema.parse({ ...valid, value: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });

  it('rejeita bucket que não é datetime ISO', () => {
    expect(() => metricSnapshotSchema.parse({ ...valid, bucket: '14/07/2026' })).toThrow();
  });

  it('rejeita granularidade desconhecida', () => {
    expect(() => metricSnapshotSchema.parse({ ...valid, granularity: 'minute' })).toThrow();
  });

  it('rejeita módulo/métrica vazios', () => {
    expect(() => metricSnapshotSchema.parse({ ...valid, module: '' })).toThrow();
    expect(() => metricSnapshotSchema.parse({ ...valid, metric: '' })).toThrow();
  });
});

describe('metricsIngestSchema', () => {
  it('aceita um lote de snapshots', () => {
    expect(() => metricsIngestSchema.parse({ snapshots: [valid, valid] })).not.toThrow();
  });

  it('rejeita lote vazio (nada a ingerir)', () => {
    expect(() => metricsIngestSchema.parse({ snapshots: [] })).toThrow();
  });

  it('limita o tamanho do lote (evita payload abusivo)', () => {
    const grande = Array.from({ length: 501 }, () => valid);
    expect(() => metricsIngestSchema.parse({ snapshots: grande })).toThrow();
  });

  it('rejeita lote com um snapshot inválido no meio', () => {
    expect(() =>
      metricsIngestSchema.parse({ snapshots: [valid, { ...valid, granularity: 'x' }] }),
    ).toThrow();
  });
});
