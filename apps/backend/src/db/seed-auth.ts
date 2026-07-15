import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadDotenvIfPresent } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createCorePool, createCoreDb } from './core/client.js';
import { users, signingKeys } from './core/schema.js';
import { hashPassword } from '../core/auth/password.service.js';
import { generateSigningKey } from '../core/auth/signing-key.js';
import { encryptCredential } from '../tenancy/crypto/credentials-cipher.js';

/**
 * Seed de DEV para a autenticação global: cria uma signing key ativa e um
 * usuário admin. Idempotente.
 */
const ADMIN_EMAIL = 'admin@wzconnect.com';
const ADMIN_PASSWORD = 'Admin@1234';

async function main(): Promise<void> {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  const pool = createCorePool(cfg.coreDatabaseUrl);
  const db = createCoreDb(pool);

  // 1. Signing key ativa (RSA), com a chave privada cifrada pela KEK.
  const activeKey = await db
    .select()
    .from(signingKeys)
    .where(eq(signingKeys.status, 'active'))
    .limit(1);
  if (activeKey.length === 0) {
    const kid = randomUUID();
    const key = await generateSigningKey(kid);
    await db.insert(signingKeys).values({
      kid,
      publicPem: key.publicPem,
      privatePemCifrada: encryptCredential(key.privatePem, cfg.tenantCredentialsKek),
      status: 'active',
    });
    console.log(`[seed-auth] signing key criada (kid=${kid})`);
  } else {
    console.log('[seed-auth] signing key ativa já existe');
  }

  // 2. Usuário admin.
  const admin = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (admin.length === 0) {
    await db.insert(users).values({
      email: ADMIN_EMAIL,
      senhaHash: await hashPassword(ADMIN_PASSWORD),
      status: 'ativo',
      platformRole: 'platform_super_admin',
    });
    console.log(`[seed-auth] admin criado (${ADMIN_EMAIL} / ${ADMIN_PASSWORD})`);
  } else {
    // Idempotente: garante o papel de plataforma em bases já semeadas.
    await db
      .update(users)
      .set({ platformRole: 'platform_super_admin' })
      .where(eq(users.email, ADMIN_EMAIL));
    console.log('[seed-auth] admin já existe (papel de plataforma garantido)');
  }

  await pool.end();
  console.log('[seed-auth] concluído');
}

main().catch((err) => {
  console.error('[seed-auth] falhou:', err);
  process.exit(1);
});
