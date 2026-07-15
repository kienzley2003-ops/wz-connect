import { JwksCache } from './jwks-cache.js';
import { verifyToken } from './verify.js';
import { checkEntitlement } from './entitlements.js';
import { reportMetrics } from './metrics.js';
import { hasModule, requireModule, tenantOf } from './modules.js';
import type { ConnectClaims, EntitlementQuery, EntitlementResult } from './types.js';
import type { MetricSnapshot } from '@wz/shared';

export interface ConnectClientOptions {
  /** Base URL do Connect (ex.: `https://connect.wz.com`). */
  readonly baseUrl: string;
  /** Issuer esperado nos tokens. Default: `wz-connect`. */
  readonly issuer?: string;
  /** URL do JWKS. Default: `<baseUrl>/.well-known/jwks.json`. */
  readonly jwksUrl?: string;
  /** `fetch` injetável. Default: o global. */
  readonly fetch?: typeof fetch;
  readonly jwksTtlMs?: number;
}

export interface ConnectClient {
  /** Verifica um token do Connect (offline após o 1º JWKS). */
  verifyToken(token: string): Promise<ConnectClaims>;
  /** O tenant tem o módulo? (claim assinado, sem rede) */
  hasModule(claims: ConnectClaims, moduleKey: string): boolean;
  /** @throws ModuleNotEnabledError */
  requireModule(claims: ConnectClaims, moduleKey: string): void;
  /** Subdomínio do tenant, ou null. */
  tenantOf(claims: ConnectClaims): string | null;
  /** Decisão fresca de entitlement no CORE (uma chamada de rede). */
  checkEntitlement(token: string, query: EntitlementQuery): Promise<EntitlementResult>;
  /** Empurra snapshots de métricas para o painel consolidado (BI por push). */
  reportMetrics(token: string, snapshots: readonly MetricSnapshot[]): Promise<number>;
}

/**
 * Cliente do WZ Connect para produtos da suíte (ADR-011).
 *
 * Não obtém credenciais de banco: elas são entregues **uma vez, no
 * provisionamento**, e ficam no cofre do produto — não há endpoint de credencial
 * em runtime. O SDK cuida de identidade e licenciamento.
 */
export function createConnectClient(options: ConnectClientOptions): ConnectClient {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const fetchFn = options.fetch ?? globalThis.fetch;
  const issuer = options.issuer ?? 'wz-connect';

  const jwks = new JwksCache({
    url: options.jwksUrl ?? `${baseUrl}/.well-known/jwks.json`,
    fetch: fetchFn,
    now: () => Date.now(),
    ...(options.jwksTtlMs !== undefined ? { ttlMs: options.jwksTtlMs } : {}),
  });

  return {
    verifyToken: (token) => verifyToken(token, { jwks, issuer }),
    hasModule,
    requireModule,
    tenantOf,
    checkEntitlement: (token, query) => checkEntitlement(token, query, { baseUrl, fetch: fetchFn }),
    reportMetrics: (token, snapshots) =>
      reportMetrics(token, snapshots, { baseUrl, fetch: fetchFn }),
  };
}
