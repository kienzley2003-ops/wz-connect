import { describe, it, expect, vi } from 'vitest';
import { checkEntitlement } from './entitlements.js';
import { ConnectApiError } from './types.js';

// Parâmetros declarados de propósito: sem eles, `mock.calls[0]` seria uma tupla
// vazia e não daria para inspecionar url/init.
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

describe('checkEntitlement', () => {
  it('envia a consulta com o token do usuário e devolve o veredito', async () => {
    const fetchFn = fakeFetch({ allowed: true });
    const result = await checkEntitlement(
      'tok',
      { feature: 'guiches_max', usage: 3 },
      opts(fetchFn),
    );

    expect(result).toEqual({ allowed: true });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://connect.wz.test/entitlements/check');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init?.body as string)).toEqual({ feature: 'guiches_max', usage: 3 });
  });

  it('devolve a negativa com motivo e limite', async () => {
    const fetchFn = fakeFetch({ allowed: false, reason: 'limit_exceeded', limit: 10 });
    await expect(
      checkEntitlement('tok', { feature: 'guiches_max', usage: 10 }, opts(fetchFn)),
    ).resolves.toEqual({ allowed: false, reason: 'limit_exceeded', limit: 10 });
  });

  it('normaliza a base URL com barra no fim', async () => {
    const fetchFn = fakeFetch({ allowed: true });
    await checkEntitlement(
      'tok',
      {},
      { baseUrl: 'https://connect.wz.test/', fetch: fetchFn as unknown as typeof fetch },
    );

    expect(fetchFn.mock.calls[0]![0]).toBe('https://connect.wz.test/entitlements/check');
  });

  it('propaga erro HTTP como ConnectApiError com status', async () => {
    const fetchFn = fakeFetch({}, false, 403);
    await expect(checkEntitlement('tok', {}, opts(fetchFn))).rejects.toMatchObject({
      name: 'ConnectApiError',
      status: 403,
    });
  });

  it('propaga falha de rede como ConnectApiError', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(checkEntitlement('tok', {}, opts(fetchFn))).rejects.toBeInstanceOf(
      ConnectApiError,
    );
  });
});
