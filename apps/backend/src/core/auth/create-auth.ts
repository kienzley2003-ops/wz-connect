import { randomUUID } from 'node:crypto';
import type { JWK } from 'jose';
import type { CoreDb } from '../../db/core/client.js';
import { AuthService } from './auth.service.js';
import { verifyPassword } from './password.service.js';
import { signAccessToken, verifyAccessToken, type AccessTokenClaims } from './token.service.js';
import { buildJwks } from './signing-key.js';
import { loadSigningKeys } from './signing-key.repository.js';
import {
  findAuthUserByEmail,
  updateAuthState,
  getActiveSessionId,
  clearActiveSession,
  getUserProfile,
  type UserProfile,
} from './user.repository.js';

export interface AuthModuleOptions {
  readonly kek: string;
  readonly issuer: string;
  readonly accessTtlSeconds?: number;
}

export interface AuthModule {
  readonly authService: AuthService;
  readonly verifyToken: (token: string) => Promise<AccessTokenClaims>;
  readonly getActiveSessionId: (userId: string) => Promise<string | null>;
  readonly logout: (userId: string) => Promise<void>;
  readonly getUserProfile: (userId: string) => Promise<UserProfile | null>;
  readonly jwks: () => Promise<{ keys: JWK[] }>;
}

/**
 * Compõe o módulo de autenticação global a partir do CORE: carrega as chaves de
 * assinatura, monta o {@link AuthService} e os verificadores de token/sessão.
 * As chaves são carregadas na inicialização (rotação recarrega o módulo).
 */
export async function createAuthModule(
  coreDb: CoreDb,
  options: AuthModuleOptions,
): Promise<AuthModule> {
  const keys = await loadSigningKeys(coreDb, options.kek);
  const active = keys.find((k) => k.status === 'active');
  if (!active) {
    throw new Error('Nenhuma signing key ativa no CORE (rode o seed de auth)');
  }
  const publicKeys = keys.map((k) => ({ kid: k.kid, publicPem: k.publicPem }));
  const accessTtlSeconds = options.accessTtlSeconds ?? 3600;

  const authService = new AuthService({
    findUserByEmail: (email) => findAuthUserByEmail(coreDb, email),
    updateAuthState: (id, patch) => updateAuthState(coreDb, id, patch),
    verifyPassword: (hash, plain) => verifyPassword(hash, plain),
    signToken: (claims) =>
      signAccessToken(claims, {
        privatePem: active.privatePem,
        kid: active.kid,
        issuer: options.issuer,
        expiresInSeconds: accessTtlSeconds,
      }),
    newSessionId: () => randomUUID(),
    now: () => new Date(),
  });

  return {
    authService,
    verifyToken: (token) => verifyAccessToken(token, { publicKeys, issuer: options.issuer }),
    getActiveSessionId: (userId) => getActiveSessionId(coreDb, userId),
    logout: (userId) => clearActiveSession(coreDb, userId),
    getUserProfile: (userId) => getUserProfile(coreDb, userId),
    jwks: () => buildJwks(publicKeys),
  };
}
