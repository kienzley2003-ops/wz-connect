import { describe, it, expect, vi } from 'vitest';
import { generateKeyPair, exportJWK, type JWK } from 'jose';
import { JwksCache } from './jwks-cache.js';
import { ConnectApiError } from './types.js';

async function makeJwk(kid: string): Promise<JWK> {
  const { publicKey } = await generateKeyPair('RS256', { extractable: true });
  return { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
}

function fakeFetch(getBody: () => unknown, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => getBody() }) as unknown as Response);
}

const URL_JWKS = 'https://connect.wz.test/.well-known/jwks.json';

describe('JwksCache', () => {
  it('busca o JWKS uma vez e reutiliza dentro do TTL', async () => {
    const jwk = await makeJwk('k1');
    const fetchFn = fakeFetch(() => ({ keys: [jwk] }));
    const cache = new JwksCache({ url: URL_JWKS, fetch: fetchFn, now: () => 0, ttlMs: 1000 });

    await cache.getKey('k1');
    await cache.getKey('k1');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(URL_JWKS);
  });

  it('rebusca depois que o TTL expira', async () => {
    const jwk = await makeJwk('k1');
    let clock = 0;
    const fetchFn = fakeFetch(() => ({ keys: [jwk] }));
    const cache = new JwksCache({ url: URL_JWKS, fetch: fetchFn, now: () => clock, ttlMs: 1000 });

    await cache.getKey('k1');
    clock = 1500;
    await cache.getKey('k1');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('kid desconhecido dispara rebusca (rotação de chave)', async () => {
    const k1 = await makeJwk('k1');
    const k2 = await makeJwk('k2');
    let clock = 0;
    let served: JWK[] = [k1];
    const fetchFn = fakeFetch(() => ({ keys: served }));
    const cache = new JwksCache({
      url: URL_JWKS,
      fetch: fetchFn,
      now: () => clock,
      ttlMs: 60_000,
      cooldownMs: 100,
    });

    await cache.getKey('k1');
    // Connect rotacionou: k2 é nova e o cache ainda está "fresco".
    served = [k1, k2];
    clock = 200;

    await expect(cache.getKey('k2')).resolves.toBeDefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('não martela o Connect com kid desconhecido dentro do cooldown', async () => {
    const k1 = await makeJwk('k1');
    const fetchFn = fakeFetch(() => ({ keys: [k1] }));
    const cache = new JwksCache({
      url: URL_JWKS,
      fetch: fetchFn,
      now: () => 0,
      ttlMs: 60_000,
      cooldownMs: 30_000,
    });

    await cache.getKey('k1');
    await expect(cache.getKey('fantasma')).rejects.toBeInstanceOf(ConnectApiError);
    await expect(cache.getKey('fantasma')).rejects.toBeInstanceOf(ConnectApiError);

    // Só o fetch inicial: o cooldown barrou as rebuscas.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('falha quando o kid continua desconhecido após rebuscar', async () => {
    const k1 = await makeJwk('k1');
    const fetchFn = fakeFetch(() => ({ keys: [k1] }));
    const cache = new JwksCache({ url: URL_JWKS, fetch: fetchFn, now: () => 0, ttlMs: 1000 });

    await expect(cache.getKey('fantasma')).rejects.toThrow(/kid/i);
  });

  it('propaga resposta HTTP de erro como ConnectApiError', async () => {
    const fetchFn = fakeFetch(() => ({}), false, 503);
    const cache = new JwksCache({ url: URL_JWKS, fetch: fetchFn, now: () => 0 });

    await expect(cache.getKey('k1')).rejects.toBeInstanceOf(ConnectApiError);
  });

  it('propaga falha de rede como ConnectApiError', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const cache = new JwksCache({ url: URL_JWKS, fetch: fetchFn, now: () => 0 });

    await expect(cache.getKey('k1')).rejects.toBeInstanceOf(ConnectApiError);
  });

  it('rejeita JWKS malformado', async () => {
    const fetchFn = fakeFetch(() => ({ nao_e_jwks: true }));
    const cache = new JwksCache({ url: URL_JWKS, fetch: fetchFn, now: () => 0 });

    await expect(cache.getKey('k1')).rejects.toBeInstanceOf(ConnectApiError);
  });
});
