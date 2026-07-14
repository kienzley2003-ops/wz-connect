import { TenantConnectionRegistry } from './tenant-connection.registry.js';
import type { TenantContext } from './tenant-context.js';
import { TenantNotFoundError } from './errors.js';

/** Linha do CORE com o tenant e as credenciais (cifradas) do seu banco. */
export interface TenantDatabaseRow {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly passwordCipher: string;
}

export interface TenantResolverDeps {
  /** Consulta o CORE por subdomínio (I/O; injetável para teste). */
  readonly lookup: (subdomain: string) => Promise<TenantDatabaseRow | null>;
  /** Decifra a senha do banco do tenant (ADR-006). */
  readonly decrypt: (cipher: string) => string;
  readonly registry: TenantConnectionRegistry;
  /** TTL do cache de lookup por subdomínio, em ms. */
  readonly cacheTtlMs: number;
  /** Relógio injetável (ms). */
  readonly now: () => number;
}

interface CacheEntry {
  readonly row: TenantDatabaseRow;
  readonly expiresAt: number;
}

/**
 * Resolve um subdomínio para o contexto do tenant (ADR-005):
 * lookup no CORE (cacheado por TTL) → decifra credenciais → conexão via registry.
 */
export class TenantResolver {
  private readonly deps: TenantResolverDeps;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(deps: TenantResolverDeps) {
    this.deps = deps;
  }

  async resolve(subdomain: string): Promise<TenantContext> {
    const row = await this.getRow(subdomain);
    if (!row) {
      throw new TenantNotFoundError(subdomain);
    }

    const connection = this.deps.registry.get({
      tenantId: row.tenantId,
      host: row.host,
      port: row.port,
      database: row.database,
      user: row.user,
      password: this.deps.decrypt(row.passwordCipher),
    });

    return { tenantId: row.tenantId, subdomain, db: connection.db };
  }

  /** Remove um subdomínio do cache (ex.: após mudança de credenciais no CORE). */
  invalidate(subdomain: string): void {
    this.cache.delete(subdomain);
  }

  private async getRow(subdomain: string): Promise<TenantDatabaseRow | null> {
    const cached = this.cache.get(subdomain);
    if (cached && cached.expiresAt > this.deps.now()) {
      return cached.row;
    }

    const row = await this.deps.lookup(subdomain);
    if (row) {
      this.cache.set(subdomain, { row, expiresAt: this.deps.now() + this.deps.cacheTtlMs });
    }
    return row;
  }
}
