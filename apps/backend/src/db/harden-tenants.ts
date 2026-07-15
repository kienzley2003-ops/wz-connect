import { Client } from 'pg';
import { loadDotenvIfPresent } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createCorePool, createCoreDb } from './core/client.js';
import {
  listActiveTenantTargets,
  findTenantById,
  saveTenantCredentials,
} from '../core/tenants/tenant.repository.js';
import { encryptCredential } from '../tenancy/crypto/credentials-cipher.js';
import { PlacementRegistry, placementFromUrl, type Placement } from '../provisioning/placement.js';
import { tenantDatabaseName } from '../provisioning/tenant-database-name.js';
import { tenantRoleName, generateDatabasePassword } from '../provisioning/tenant-role.js';
import { ensureTenantRole } from '../provisioning/database-admin.js';

/**
 * Remedia tenants provisionados ANTES da role dedicada por tenant, e serve como
 * ferramenta de **rotação** de credencial.
 *
 * Para cada tenant ativo: cria/rotaciona a role dedicada, torna-a dona do banco,
 * fecha o banco para o PUBLIC e transfere a posse dos objetos existentes (que
 * foram criados pela credencial compartilhada antiga). Grava a nova credencial
 * cifrada no CORE e a revela uma vez no stdout, para o operador atualizar o
 * cofre do produto.
 *
 * ⚠️ Rotaciona a senha: produtos usando a credencial antiga precisam ser
 * atualizados.
 */
async function transferOwnership(
  placement: Placement,
  dbName: string,
  roleName: string,
): Promise<void> {
  // `REASSIGN OWNED BY <superusuário>` não serve: ele possui objetos de sistema
  // e o PostgreSQL recusa ("required by the database system"). Transferimos
  // apenas as tabelas e schemas de usuário, um a um.
  const client = new Client({
    host: placement.host,
    port: placement.port,
    user: placement.user,
    password: placement.password,
    database: dbName,
  });
  await client.connect();
  try {
    const tables = await client.query<{ schemaname: string; tablename: string }>(
      `SELECT schemaname, tablename FROM pg_tables
       WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
    );
    for (const t of tables.rows) {
      await client.query(`ALTER TABLE "${t.schemaname}"."${t.tablename}" OWNER TO ${roleName}`);
    }

    // Schemas criados pela aplicação (ex.: `drizzle`, do journal de migração).
    // `public` fica de fora: pertence a pg_database_owner e já segue o dono do banco.
    const schemas = await client.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace
       WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public')
         AND nspname NOT LIKE 'pg\\_%'`,
    );
    for (const s of schemas.rows) {
      await client.query(`ALTER SCHEMA "${s.nspname}" OWNER TO ${roleName}`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  const pool = createCorePool(cfg.coreDatabaseUrl);
  const coreDb = createCoreDb(pool);
  const placements = new PlacementRegistry([placementFromUrl('default', cfg.coreDatabaseUrl)]);

  const targets = await listActiveTenantTargets(coreDb);
  let failed = 0;

  for (const target of targets) {
    try {
      const tenant = await findTenantById(coreDb, target.tenantId);
      if (!tenant) throw new Error('tenant sumiu do CORE');

      const dbName = tenantDatabaseName(tenant.slug);
      const roleName = tenantRoleName(tenant.slug);
      const placement = placements.get(tenant.dbPlacement);
      const password = generateDatabasePassword();

      await ensureTenantRole(placement, dbName, roleName, password);
      await transferOwnership(placement, dbName, roleName);
      await saveTenantCredentials(coreDb, tenant.id, {
        host: placement.host,
        porta: placement.port,
        dbname: dbName,
        usuario: roleName,
        senhaCifrada: encryptCredential(password, cfg.tenantCredentialsKek),
        servidor: placement.name,
      });

      console.log(`[harden] ✓ ${tenant.subdominio}: role=${roleName} senha=${password}`);
    } catch (err) {
      failed++;
      console.error(
        `[harden] ✗ ${target.subdomain}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await pool.end();
  console.log(`[harden] ${targets.length - failed}/${targets.length} tenants blindados`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[harden] falhou:', err);
  process.exit(1);
});
