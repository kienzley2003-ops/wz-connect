import type { TenantDb } from './tenant-context.js';

/** Credenciais de conexão ao banco de um tenant (decifradas do CORE). */
export interface TenantDbCredentials {
  readonly tenantId: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
}

/** Conexão viva de um tenant: a instância Drizzle e como encerrá-la. */
export interface TenantConnection {
  readonly db: TenantDb;
  readonly close: () => Promise<void>;
}

/** Cria uma conexão a partir das credenciais (injetável — I/O real fica fora daqui). */
export type ConnectionFactory = (credentials: TenantDbCredentials) => TenantConnection;

export interface RegistryOptions {
  /** Teto de conexões simultâneas em cache (LRU eviction acima disso). */
  readonly maxConnections: number;
  readonly factory: ConnectionFactory;
}

/**
 * Registry + Object Pool de conexões por tenant (ADR-005).
 * Mantém um cache de conexões Drizzle reutilizáveis, com eviction LRU.
 * O `Map` preserva a ordem de inserção, usada para identificar o menos recente.
 */
export class TenantConnectionRegistry {
  private readonly cache = new Map<string, TenantConnection>();
  private readonly maxConnections: number;
  private readonly factory: ConnectionFactory;

  constructor(options: RegistryOptions) {
    this.maxConnections = options.maxConnections;
    this.factory = options.factory;
  }

  /** Retorna a conexão do tenant (cria sob demanda; renova a recência no hit). */
  get(credentials: TenantDbCredentials): TenantConnection {
    const key = credentials.tenantId;
    const existing = this.cache.get(key);
    if (existing) {
      // move-to-front: reinsere para virar o mais recente.
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }

    const connection = this.factory(credentials);
    this.cache.set(key, connection);
    this.evictIfNeeded();
    return connection;
  }

  /** Fecha e remove a conexão de um tenant (no-op se ausente). */
  async close(tenantId: string): Promise<void> {
    const connection = this.cache.get(tenantId);
    if (!connection) return;
    this.cache.delete(tenantId);
    await connection.close();
  }

  /** Fecha todas as conexões e esvazia o registry. */
  async closeAll(): Promise<void> {
    const connections = [...this.cache.values()];
    this.cache.clear();
    await Promise.all(connections.map((c) => c.close()));
  }

  size(): number {
    return this.cache.size;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxConnections) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) return;
      const oldest = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      // Fecha em background: eviction não bloqueia a request atual.
      void oldest?.close();
    }
  }
}
