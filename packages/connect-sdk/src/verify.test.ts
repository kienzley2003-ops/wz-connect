import { describe, it, expect, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK, type KeyLike } from 'jose';
import { verifyToken } from './verify.js';
import { JwksCache } from './jwks-cache.js';

const ISSUER = 'wz-connect';
const t0 = new Date('2026-07-14T12:00:00.000Z');

async function setup(kid = 'k1') {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const fetchFn = vi.fn(
    async () =>
      ({ ok: true, status: 200, json: async () => ({ keys: [jwk] }) }) as unknown as Response,
  );
  const jwks = new JwksCache({
    url: 'https://connect.wz.test/.well-known/jwks.json',
    fetch: fetchFn,
    now: () => 0,
  });
  return { privateKey, jwks, fetchFn, kid };
}

async function sign(privateKey: KeyLike, kid: string, expSeconds = 3600) {
  const iat = Math.floor(t0.getTime() / 1000);
  return new SignJWT({ tnt: 'acme', mods: ['masterfila'], sid: 's1' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setSubject('u1')
    .setIssuedAt(iat)
    .setIssuer(ISSUER)
    .setExpirationTime(iat + expSeconds)
    .sign(privateKey);
}

describe('verifyToken', () => {
  it('verifica um token válido e devolve os claims', async () => {
    const { privateKey, jwks, kid } = await setup();
    const token = await sign(privateKey, kid);

    const claims = await verifyToken(token, { jwks, issuer: ISSUER, now: () => t0 });

    expect(claims.sub).toBe('u1');
    expect(claims.tnt).toBe('acme');
    expect(claims.mods).toEqual(['masterfila']);
  });

  it('roda offline após o primeiro JWKS (não bate no Connect a cada request)', async () => {
    const { privateKey, jwks, fetchFn, kid } = await setup();
    const token = await sign(privateKey, kid);

    await verifyToken(token, { jwks, issuer: ISSUER, now: () => t0 });
    await verifyToken(token, { jwks, issuer: ISSUER, now: () => t0 });
    await verifyToken(token, { jwks, issuer: ISSUER, now: () => t0 });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejeita issuer diferente', async () => {
    const { privateKey, jwks, kid } = await setup();
    const token = await sign(privateKey, kid);

    await expect(
      verifyToken(token, { jwks, issuer: 'outro-issuer', now: () => t0 }),
    ).rejects.toThrow();
  });

  it('rejeita token expirado', async () => {
    const { privateKey, jwks, kid } = await setup();
    const token = await sign(privateKey, kid, 60);

    const later = new Date(t0.getTime() + 120_000);
    await expect(verifyToken(token, { jwks, issuer: ISSUER, now: () => later })).rejects.toThrow();
  });

  it('rejeita token assinado por outra chave', async () => {
    const { jwks, kid } = await setup();
    const intruso = await generateKeyPair('RS256', { extractable: true });
    const token = await sign(intruso.privateKey, kid);

    await expect(verifyToken(token, { jwks, issuer: ISSUER, now: () => t0 })).rejects.toThrow();
  });

  it('rejeita token sem kid no header', async () => {
    const { privateKey, jwks } = await setup();
    const iat = Math.floor(t0.getTime() / 1000);
    const token = await new SignJWT({ sid: 's1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('u1')
      .setIssuedAt(iat)
      .setIssuer(ISSUER)
      .setExpirationTime(iat + 3600)
      .sign(privateKey);

    await expect(verifyToken(token, { jwks, issuer: ISSUER, now: () => t0 })).rejects.toThrow(
      /kid/i,
    );
  });
});
