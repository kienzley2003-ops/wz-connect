import type { CoreDb } from '../db/core/client.js';
import { encryptCredential } from '../tenancy/crypto/credentials-cipher.js';
import {
  findTenantById,
  saveTenantCredentials,
  activateTenant,
} from '../core/tenants/tenant.repository.js';
import { PlacementRegistry, placementFromUrl } from './placement.js';
import { createDatabase, ensureTenantRole } from './database-admin.js';
import { generateDatabasePassword } from './tenant-role.js';
import { migrateTenantDatabase, seedTenantDatabase } from './tenant-db.io.js';
import type { ProvisioningDeps } from './provisioning.service.js';

export interface ProvisioningOptions {
  readonly kek: string;
  /** URL do CORE — origem do placement `default` (mesmo servidor Postgres). */
  readonly coreDatabaseUrl: string;
}

/**
 * Compõe as dependências reais do provisionamento.
 *
 * Hoje há um único placement (`default`, derivado da URL do CORE). Placements
 * dedicados (enterprise) entram aqui sem tocar no serviço — é o ponto de
 * extensão da Strategy (ADR-005/012).
 */
export function createProvisioningDeps(
  coreDb: CoreDb,
  options: ProvisioningOptions,
): ProvisioningDeps {
  const placements = new PlacementRegistry([placementFromUrl('default', options.coreDatabaseUrl)]);

  return {
    findTenant: (id) => findTenantById(coreDb, id),
    resolvePlacement: (name) => placements.get(name),
    createDatabase,
    generatePassword: () => generateDatabasePassword(),
    ensureRole: ensureTenantRole,
    migrateTenantDb: migrateTenantDatabase,
    seedTenantDb: seedTenantDatabase,
    encrypt: (plain) => encryptCredential(plain, options.kek),
    saveCredentials: (id, creds) => saveTenantCredentials(coreDb, id, creds),
    activateTenant: (id) => activateTenant(coreDb, id),
  };
}
