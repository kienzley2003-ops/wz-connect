import { describe, it, expect } from 'vitest';
import { generateSigningKey, buildJwks } from './signing-key.js';

describe('signing-key', () => {
  it('gera um par de chaves RSA em PEM com o kid informado', async () => {
    const key = await generateSigningKey('kid-1');

    expect(key.kid).toBe('kid-1');
    expect(key.privatePem).toContain('BEGIN PRIVATE KEY');
    expect(key.publicPem).toContain('BEGIN PUBLIC KEY');
  });

  it('constrói um JWKS a partir das chaves públicas', async () => {
    const key = await generateSigningKey('kid-1');
    const jwks = await buildJwks([{ kid: key.kid, publicPem: key.publicPem }]);

    expect(jwks.keys).toHaveLength(1);
    const jwk = jwks.keys[0]!;
    expect(jwk.kid).toBe('kid-1');
    expect(jwk.kty).toBe('RSA');
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');
    expect(jwk.n).toBeTruthy();
    // a chave privada nunca aparece no JWKS
    expect(jwk.d).toBeUndefined();
  });

  it('inclui uma entrada por chave no JWKS', async () => {
    const k1 = await generateSigningKey('k1');
    const k2 = await generateSigningKey('k2');
    const jwks = await buildJwks([
      { kid: k1.kid, publicPem: k1.publicPem },
      { kid: k2.kid, publicPem: k2.publicPem },
    ]);

    expect(jwks.keys.map((k) => k.kid)).toEqual(['k1', 'k2']);
  });
});
