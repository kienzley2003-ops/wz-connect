import { generateKeyPair, exportPKCS8, exportSPKI, exportJWK, importSPKI, type JWK } from 'jose';

export interface GeneratedSigningKey {
  readonly kid: string;
  readonly privatePem: string;
  readonly publicPem: string;
}

/** Gera um par de chaves RSA (RS256) exportado em PEM, associado a um `kid`. */
export async function generateSigningKey(kid: string): Promise<GeneratedSigningKey> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  return {
    kid,
    privatePem: await exportPKCS8(privateKey),
    publicPem: await exportSPKI(publicKey),
  };
}

/** Converte uma chave pública PEM em JWK público (com kid/alg/use). */
export async function publicPemToJwk(kid: string, publicPem: string): Promise<JWK> {
  const key = await importSPKI(publicPem, 'RS256', { extractable: true });
  const jwk = await exportJWK(key);
  return { ...jwk, kid, alg: 'RS256', use: 'sig' };
}

/** Monta o documento JWKS a partir das chaves públicas (endpoint `/.well-known/jwks.json`). */
export async function buildJwks(
  keys: ReadonlyArray<{ kid: string; publicPem: string }>,
): Promise<{ keys: JWK[] }> {
  const jwks = await Promise.all(keys.map((k) => publicPemToJwk(k.kid, k.publicPem)));
  return { keys: jwks };
}
