import { eq } from 'drizzle-orm';
import { loadDotenvIfPresent } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createCorePool, createCoreDb } from './core/client.js';
import { tenants, tenantDatabases } from './core/schema.js';
import { encryptCredential } from '../tenancy/crypto/credentials-cipher.js';

/**
 * Seed de DEV: cria um tenant "demo" com banco próprio (`wz_tenant_demo`) e
 * registra suas credenciais cifradas no CORE, para exercitar a resolução E2E.
 * Idempotente. Não é o provisionamento de produção (Fase 4).
 */
const SUBDOMAIN = 'demo';
const TENANT_DB = 'wz_tenant_demo';

async function main(): Promise<void> {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  const url = new URL(cfg.coreDatabaseUrl);
  const pool = createCorePool(cfg.coreDatabaseUrl);
  const db = createCoreDb(pool);

  // 1. Cria o banco exclusivo do tenant (fora de transação).
  try {
    await pool.query(`CREATE DATABASE ${TENANT_DB}`);
    console.log(`[seed] banco ${TENANT_DB} criado`);
  } catch (err) {
    if ((err as { code?: string }).code === '42P04') {
      console.log(`[seed] banco ${TENANT_DB} já existe`);
    } else {
      throw err;
    }
  }

  // 2. Tenant ativo no CORE.
  await db
    .insert(tenants)
    .values({ nome: 'Demo', slug: SUBDOMAIN, subdominio: SUBDOMAIN, status: 'ativo' })
    .onConflictDoNothing();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.subdominio, SUBDOMAIN))
    .limit(1);
  if (!tenant) throw new Error('[seed] tenant não encontrado após insert');

  // 3. Credenciais (cifradas) do banco do tenant.
  const senhaCifrada = encryptCredential(url.password, cfg.tenantCredentialsKek);
  const values = {
    tenantId: tenant.id,
    host: url.hostname,
    porta: Number(url.port),
    dbname: TENANT_DB,
    usuario: url.username,
    senhaCifrada,
  };
  const existing = await db
    .select()
    .from(tenantDatabases)
    .where(eq(tenantDatabases.tenantId, tenant.id))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(tenantDatabases).values(values);
    console.log('[seed] tenant_databases criado');
  } else {
    await db.update(tenantDatabases).set(values).where(eq(tenantDatabases.tenantId, tenant.id));
    console.log('[seed] tenant_databases atualizado');
  }

  await pool.end();
  console.log(`[seed] tenant "${SUBDOMAIN}" pronto (banco ${TENANT_DB})`);
}

main().catch((err) => {
  console.error('[seed] falhou:', err);
  process.exit(1);
});
