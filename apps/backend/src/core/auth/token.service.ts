import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from 'jose';

export interface AccessTokenClaims extends JWTPayload {
  /** Usuário global. */
  sub: string;
  /** Id da sessão ativa (sessão única — ADR-008). */
  sid: string;
  /** Papel de plataforma (ausente para usuário comum). */
  prole?: string;
  /** Tenant/subdomínio ativo (preenchido a partir da Fase 3). */
  tnt?: string;
  roles?: string[];
  mods?: string[];
}

export interface SignOptions {
  readonly privatePem: string;
  readonly kid: string;
  readonly issuer: string;
  readonly expiresInSeconds: number;
  readonly now?: Date;
}

export interface PublicKeyRef {
  readonly kid: string;
  readonly publicPem: string;
}

export interface VerifyOptions {
  readonly publicKeys: ReadonlyArray<PublicKeyRef>;
  readonly issuer: string;
  readonly now?: Date;
}

/** Assina um access token RS256 com o `kid` no header (para seleção via JWKS). */
export async function signAccessToken(
  claims: Omit<AccessTokenClaims, keyof JWTPayload> & Partial<JWTPayload>,
  options: SignOptions,
): Promise<string> {
  const key = await importPKCS8(options.privatePem, 'RS256');
  const iat = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: options.kid })
    .setIssuedAt(iat)
    .setIssuer(options.issuer)
    .setExpirationTime(iat + options.expiresInSeconds)
    .sign(key);
}

/**
 * Verifica um access token: seleciona a chave pública pelo `kid` do header,
 * valida assinatura, issuer e expiração.
 * @throws Error quando inválido/expirado/kid desconhecido.
 */
export async function verifyAccessToken(
  token: string,
  options: VerifyOptions,
): Promise<AccessTokenClaims> {
  const keyResolver = async (header: { kid?: string }) => {
    const match = options.publicKeys.find((k) => k.kid === header.kid);
    if (!match) {
      throw new Error(`Chave de assinatura desconhecida (kid=${header.kid})`);
    }
    return importSPKI(match.publicPem, 'RS256');
  };

  const { payload } = await jwtVerify(token, keyResolver, {
    issuer: options.issuer,
    currentDate: options.now,
  });

  return payload as AccessTokenClaims;
}
