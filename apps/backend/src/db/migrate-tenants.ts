import { loadDotenvIfPresent } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createCorePool, createCoreDb } from './core/client.js';
import {
  listActiveTenantTargets,
  findTenantDatabaseByTenantId,
} from '../core/tenants/tenant.repository.js';
import { decryptCredential } from '../tenancy/crypto/credentials-cipher.js';
import { migrateTenantDatabase } from '../provisioning/tenant-db.io.js';
import { migrateAllTenants } from '../provisioning/tenant-migrator.js';

/**
 * CLI do tenant-migrator (ADR-009): aplica as migrações pendentes a TODOS os
 * bancos de tenant ativos. Resiliente — reporta falhas sem travar o rollout.
 * Sai com código 1 se algum tenant falhar (útil no pipeline de deploy).
 */
async function main(): Promise<void> {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  const pool = createCorePool(cfg.coreDatabaseUrl);
  const coreDb = createCoreDb(pool);

  const outcomes = await migrateAllTenants({
    listTargets: () => listActiveTenantTargets(coreDb),
    migrateOne: async (target) => {
      const row = await findTenantDatabaseByTenantId(coreDb, target.tenantId);
      if (!row) {
        throw new Error('sem credenciais registradas no CORE');
      }
      await migrateTenantDatabase(
        {
          name: row.servidor,
          host: row.host,
          port: row.porta,
          user: row.usuario,
          password: decryptCredential(row.senhaCifrada, cfg.tenantCredentialsKek),
        },
        row.dbname,
      );
    },
    onProgress: (outcome) => {
      const mark = outcome.status === 'ok' ? '✓' : '✗';
      console.log(
        `[migrate-tenants] ${mark} ${outcome.subdomain}${outcome.error ? ` — ${outcome.error}` : ''}`,
      );
    },
  });

  await pool.end();

  const failed = outcomes.filter((o) => o.status === 'failed');
  console.log(
    `[migrate-tenants] ${outcomes.length - failed.length}/${outcomes.length} tenants migrados`,
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[migrate-tenants] falhou:', err);
  process.exit(1);
});
