import { describe, it, expect } from 'vitest';
import { toBucket, bucketRange } from './bucketing.js';

describe('toBucket', () => {
  it('trunca para o início da hora', () => {
    const d = new Date('2026-07-14T13:47:31.512Z');
    expect(toBucket(d, 'hour').toISOString()).toBe('2026-07-14T13:00:00.000Z');
  });

  it('trunca para o início do dia (UTC)', () => {
    const d = new Date('2026-07-14T13:47:31.512Z');
    expect(toBucket(d, 'day').toISOString()).toBe('2026-07-14T00:00:00.000Z');
  });

  it('é idempotente: truncar um bucket devolve ele mesmo', () => {
    const b = toBucket(new Date('2026-07-14T13:47:31.512Z'), 'hour');
    expect(toBucket(b, 'hour').getTime()).toBe(b.getTime());
  });

  it('instantes na mesma hora caem no mesmo bucket', () => {
    const a = toBucket(new Date('2026-07-14T13:00:00.000Z'), 'hour');
    const b = toBucket(new Date('2026-07-14T13:59:59.999Z'), 'hour');
    expect(a.getTime()).toBe(b.getTime());
  });

  it('instantes em horas diferentes caem em buckets diferentes', () => {
    const a = toBucket(new Date('2026-07-14T13:59:59.999Z'), 'hour');
    const b = toBucket(new Date('2026-07-14T14:00:00.000Z'), 'hour');
    expect(a.getTime()).not.toBe(b.getTime());
  });

  it('rejeita data inválida em vez de gerar bucket inválido', () => {
    expect(() => toBucket(new Date('nao-e-data'), 'hour')).toThrow(/data/i);
  });
});

describe('bucketRange', () => {
  it('calcula a janela retroativa em horas', () => {
    const now = new Date('2026-07-14T13:47:00.000Z');
    const { from, to } = bucketRange(now, 'hour', 3);

    expect(to.toISOString()).toBe('2026-07-14T13:00:00.000Z');
    expect(from.toISOString()).toBe('2026-07-14T11:00:00.000Z');
  });

  it('calcula a janela retroativa em dias', () => {
    const now = new Date('2026-07-14T13:47:00.000Z');
    const { from, to } = bucketRange(now, 'day', 7);

    expect(to.toISOString()).toBe('2026-07-14T00:00:00.000Z');
    expect(from.toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });

  it('janela de 1 período cobre só o bucket atual', () => {
    const now = new Date('2026-07-14T13:47:00.000Z');
    const { from, to } = bucketRange(now, 'hour', 1);
    expect(from.getTime()).toBe(to.getTime());
  });

  it('rejeita quantidade de períodos não positiva', () => {
    expect(() => bucketRange(new Date('2026-07-14T13:00:00.000Z'), 'hour', 0)).toThrow(/período/i);
  });
});
