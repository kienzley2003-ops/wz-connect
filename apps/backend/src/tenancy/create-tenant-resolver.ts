import type { CoreDb } from '../db/core/client.js';
import { findActiveTenantDatabaseBySubdomain } from '../core/tenants/tenant.repository.js';
import { decryptCredential } from './crypto/credentials-cipher.js';
import { createTenantConnection } from './tenant-connection.factory.js';
import { TenantConnectionRegistry } from './tenant-connection.registry.js';
import { TenantResolver } from './tenant-resolver.js';

export interface CreateTenantResolverOptions {
  /** Chave-mestra (KEK) para decifrar as credenciais do banco (ADR-006). */
  readonly kek: string;
  /** TTL do cache de lookup por subdomínio (ms). */
  readonly cacheTtlMs?: number;
  /** Teto de conexões simultâneas no registry (ADR-012). */
  readonly maxConnections?: number;
}

/**
 * Compõe um {@link TenantResolver} real: lookup no CORE, decifra via KEK e
 * conexões via factory pg/Drizzle, com registry (Object Pool + LRU).
 */
export function createTenantResolver(
  coreDb: CoreDb,
  options: CreateTenantResolverOptions,
): TenantResolver {
  return new TenantResolver({
    lookup: (subdomain) => findActiveTenantDatabaseBySubdomain(coreDb, subdomain),
    decrypt: (cipher) => decryptCredential(cipher, options.kek),
    registry: new TenantConnectionRegistry({
      maxConnections: options.maxConnections ?? 50,
      factory: createTenantConnection,
    }),
    cacheTtlMs: options.cacheTtlMs ?? 30_000,
    now: () => Date.now(),
  });
}
