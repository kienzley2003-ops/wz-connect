import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken } from './token.service.js';
import { generateSigningKey } from './signing-key.js';

const ISSUER = 'https://connect.wz.test';
const t0 = new Date('2026-07-14T12:00:00.000Z');

async function setup() {
  const key = await generateSigningKey('kid-1');
  const publicKeys = [{ kid: key.kid, publicPem: key.publicPem }];
  return { key, publicKeys };
}

describe('token.service', () => {
  it('assina e verifica um token válido (round-trip)', async () => {
    const { key, publicKeys } = await setup();
    const token = await signAccessToken(
      { sub: 'user-1', sid: 'sess-1' },
      { privatePem: key.privatePem, kid: key.kid, issuer: ISSUER, expiresInSeconds: 60, now: t0 },
    );

    const claims = await verifyAccessToken(token, { publicKeys, issuer: ISSUER, now: t0 });
    expect(claims.sub).toBe('user-1');
    expect(claims.sid).toBe('sess-1');
    expect(claims.iss).toBe(ISSUER);
  });

  it('rejeita issuer diferente', async () => {
    const { key, publicKeys } = await setup();
    const token = await signAccessToken(
      { sub: 'u', sid: 's' },
      { privatePem: key.privatePem, kid: key.kid, issuer: ISSUER, expiresInSeconds: 60, now: t0 },
    );

    await expect(
      verifyAccessToken(token, { publicKeys, issuer: 'https://outro', now: t0 }),
    ).rejects.toThrow();
  });

  it('rejeita token expirado', async () => {
    const { key, publicKeys } = await setup();
    const token = await signAccessToken(
      { sub: 'u', sid: 's' },
      { privatePem: key.privatePem, kid: key.kid, issuer: ISSUER, expiresInSeconds: 60, now: t0 },
    );

    const later = new Date(t0.getTime() + 120_000);
    await expect(
      verifyAccessToken(token, { publicKeys, issuer: ISSUER, now: later }),
    ).rejects.toThrow();
  });

  it('rejeita token cujo kid não está no conjunto de chaves', async () => {
    const { key } = await setup();
    const other = await generateSigningKey('kid-2');
    const token = await signAccessToken(
      { sub: 'u', sid: 's' },
      { privatePem: key.privatePem, kid: key.kid, issuer: ISSUER, expiresInSeconds: 60, now: t0 },
    );

    await expect(
      verifyAccessToken(token, {
        publicKeys: [{ kid: other.kid, publicPem: other.publicPem }],
        issuer: ISSUER,
        now: t0,
      }),
    ).rejects.toThrow();
  });
});
