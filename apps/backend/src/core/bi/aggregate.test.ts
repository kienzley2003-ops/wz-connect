import { describe, it, expect } from 'vitest';
import { summarize, type StoredSnapshot } from './aggregate.js';

const snap = (over: Partial<StoredSnapshot> = {}): StoredSnapshot => ({
  module: 'masterfila',
  metric: 'tickets_atendidos',
  value: 10,
  bucket: new Date('2026-07-14T10:00:00.000Z'),
  ...over,
});

describe('summarize', () => {
  it('soma os valores da mesma métrica ao longo das janelas', () => {
    const result = summarize([
      snap({ value: 10, bucket: new Date('2026-07-14T10:00:00.000Z') }),
      snap({ value: 5, bucket: new Date('2026-07-14T11:00:00.000Z') }),
    ]);

    expect(result).toEqual([
      {
        module: 'masterfila',
        metric: 'tickets_atendidos',
        total: 15,
        points: 2,
        lastBucket: '2026-07-14T11:00:00.000Z',
      },
    ]);
  });

  it('separa métricas diferentes', () => {
    const result = summarize([
      snap({ metric: 'tickets_atendidos', value: 10 }),
      snap({ metric: 'tempo_medio_espera', value: 42 }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.metric).sort()).toEqual(['tempo_medio_espera', 'tickets_atendidos']);
  });

  it('separa módulos diferentes com a mesma métrica', () => {
    const result = summarize([
      snap({ module: 'masterfila', metric: 'ativos', value: 3 }),
      snap({ module: 'agenda', metric: 'ativos', value: 7 }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.module === 'agenda')?.total).toBe(7);
    expect(result.find((r) => r.module === 'masterfila')?.total).toBe(3);
  });

  it('lastBucket é o mais recente, independente da ordem de entrada', () => {
    const result = summarize([
      snap({ bucket: new Date('2026-07-14T12:00:00.000Z') }),
      snap({ bucket: new Date('2026-07-14T09:00:00.000Z') }),
      snap({ bucket: new Date('2026-07-14T11:00:00.000Z') }),
    ]);

    expect(result[0]?.lastBucket).toBe('2026-07-14T12:00:00.000Z');
  });

  it('ordena por módulo e depois por métrica (saída estável)', () => {
    const result = summarize([
      snap({ module: 'masterfila', metric: 'z' }),
      snap({ module: 'agenda', metric: 'b' }),
      snap({ module: 'masterfila', metric: 'a' }),
      snap({ module: 'agenda', metric: 'a' }),
    ]);

    expect(result.map((r) => `${r.module}.${r.metric}`)).toEqual([
      'agenda.a',
      'agenda.b',
      'masterfila.a',
      'masterfila.z',
    ]);
  });

  it('devolve vazio quando não há snapshots', () => {
    expect(summarize([])).toEqual([]);
  });

  it('lida com valores negativos e zero', () => {
    const result = summarize([
      snap({ value: -5 }),
      snap({ value: 0, bucket: new Date('2026-07-14T11:00:00.000Z') }),
    ]);
    expect(result[0]?.total).toBe(-5);
    expect(result[0]?.points).toBe(2);
  });
});
