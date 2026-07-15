import { jwtVerify } from 'jose';
import type { JwksCache } from './jwks-cache.js';
import { ConnectApiError, type ConnectClaims } from './types.js';

export interface VerifyOptions {
  readonly jwks: JwksCache;
  readonly issuer: string;
  /** Relógio injetável (testes de expiração). */
  readonly now?: () => Date;
}

/**
 * Verifica um token emitido pelo Connect: seleciona a chave pelo `kid`, confere
 * assinatura (RS256), issuer e expiração.
 *
 * Roda **offline** depois do primeiro JWKS: o produto não depende do Connect
 * estar de pé a cada request.
 */
export async function verifyToken(token: string, options: VerifyOptions): Promise<ConnectClaims> {
  const { payload } = await jwtVerify(
    token,
    async (header) => {
      if (!header.kid) {
        throw new ConnectApiError('Token sem kid no header');
      }
      return options.jwks.getKey(header.kid);
    },
    {
      issuer: options.issuer,
      ...(options.now ? { currentDate: options.now() } : {}),
    },
  );

  return payload as unknown as ConnectClaims;
}
