import { describe, it, expect, vi } from 'vitest';
import type { MetricSnapshot } from '@wz/shared';
import { reportMetrics } from './metrics.js';
import { ConnectApiError } from './types.js';

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, status, json: async () => body }) as unknown as Response,
  );
}
type FakeFetch = ReturnType<typeof fakeFetch>;

const opts = (fetchFn: FakeFetch) => ({
  baseUrl: 'https://connect.wz.test',
  fetch: fetchFn as unknown as typeof fetch,
});

const snapshot: MetricSnapshot = {
  module: 'masterfila',
  metric: 'tickets_atendidos',
  value: 42,
  bucket: '2026-07-14T13:00:00.000Z',
  granularity: 'hour',
};

describe('reportMetrics', () => {
  it('envia os snapshots com o token do usuário e devolve quantos foram aceitos', async () => {
    const fetchFn = fakeFetch({ ingested: 1 });
    const count = await reportMetrics('tok', [snapshot], opts(fetchFn));

    expect(count).toBe(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://connect.wz.test/metrics/ingest');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init?.body as string)).toEqual({ snapshots: [snapshot] });
  });

  it('não chama a rede quando não há snapshots', async () => {
    const fetchFn = fakeFetch({ ingested: 0 });
    expect(await reportMetrics('tok', [], opts(fetchFn))).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('propaga erro HTTP como ConnectApiError com status', async () => {
    const fetchFn = fakeFetch({}, false, 403);
    await expect(reportMetrics('tok', [snapshot], opts(fetchFn))).rejects.toMatchObject({
      name: 'ConnectApiError',
      status: 403,
    });
  });

  it('propaga falha de rede como ConnectApiError', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      reportMetrics('tok', [snapshot], opts(fetchFn as unknown as FakeFetch)),
    ).rejects.toBeInstanceOf(ConnectApiError);
  });
});
