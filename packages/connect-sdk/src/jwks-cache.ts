import { importJWK, type JWK, type KeyLike } from 'jose';
import { ConnectApiError } from './types.js';

export interface JwksCacheOptions {
  /** URL do JWKS do Connect (`/.well-known/jwks.json`). */
  readonly url: string;
  /** `fetch` injetável (testes / agentes HTTP customizados). */
  readonly fetch: typeof fetch;
  /** Relógio injetável (ms). */
  readonly now: () => number;
  /** Validade do cache. Default: 5 min. */
  readonly ttlMs?: number;
  /** Intervalo mínimo entre rebuscas. Default: 30 s. */
  readonly cooldownMs?: number;
}

/**
 * Cache das chaves públicas do Connect, com suporte a **rotação**.
 *
 * Um `kid` desconhecido normalmente significa que o Connect rotacionou a chave,
 * então rebuscamos — mas só respeitando um **cooldown**, senão um token forjado
 * com `kid` aleatório viraria um vetor de DoS contra o Connect.
 */
export class JwksCache {
  private readonly options: Required<JwksCacheOptions>;
  private keys: Map<string, JWK> | null = null;
  private expiresAt = 0;
  private lastFetchAt = Number.NEGATIVE_INFINITY;

  constructor(options: JwksCacheOptions) {
    this.options = {
      ttlMs: 5 * 60_000,
      cooldownMs: 30_000,
      ...options,
    };
  }

  /** Chave pública para um `kid`. @throws ConnectApiError se indisponível. */
  async getKey(kid: string): Promise<KeyLike | Uint8Array> {
    if (!this.isFresh() || (!this.keys?.has(kid) && this.canRefetch())) {
      await this.refresh();
    }

    const jwk = this.keys?.get(kid);
    if (!jwk) {
      throw new ConnectApiError(`Chave de assinatura desconhecida no JWKS (kid=${kid})`);
    }
    return importJWK(jwk, 'RS256');
  }

  private isFresh(): boolean {
    return this.keys !== null && this.options.now() < this.expiresAt;
  }

  private canRefetch(): boolean {
    return this.options.now() - this.lastFetchAt >= this.options.cooldownMs;
  }

  private async refresh(): Promise<void> {
    this.lastFetchAt = this.options.now();

    let response: Response;
    try {
      response = await this.options.fetch(this.options.url);
    } catch (err) {
      throw new ConnectApiError(
        `Falha ao buscar o JWKS do Connect: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new ConnectApiError('Falha ao buscar o JWKS do Connect', response.status);
    }

    const body = (await response.json()) as { keys?: JWK[] };
    if (!Array.isArray(body.keys)) {
      throw new ConnectApiError('JWKS do Connect em formato inesperado');
    }

    this.keys = new Map(
      body.keys
        .filter((k): k is JWK & { kid: string } => typeof k.kid === 'string')
        .map((k) => [k.kid, k]),
    );
    this.expiresAt = this.options.now() + this.options.ttlMs;
  }
}
