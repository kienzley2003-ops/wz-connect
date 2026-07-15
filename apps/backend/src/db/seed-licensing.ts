import { eq } from 'drizzle-orm';
import { loadDotenvIfPresent } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createCorePool, createCoreDb } from './core/client.js';
import { tenants, users, plans, modules, tenantModules, memberships } from './core/schema.js';
import { hashPassword } from '../core/auth/password.service.js';

/**
 * Seed de DEV do licenciamento (Fase 3): plano com limites, catálogo de módulos,
 * habilitação por tenant e membership do admin. Idempotente.
 * Requer `db:seed-demo` (tenant) e `db:seed-auth` (admin) antes.
 */
const SUBDOMAIN = 'demo';
const ADMIN_EMAIL = 'admin@wzconnect.com';
/** Usuário comum do tenant: SEM papel de plataforma (exercita o 403 do RBAC). */
const OPERADOR_EMAIL = 'operador@wzconnect.com';
const OPERADOR_PASSWORD = 'Operador@1234';
const PLAN_NAME = 'Pro';
const PLAN_LIMITS = { guiches_max: 10, relatorios: true, beta: false };
const MODULE_CATALOG = [
  { chave: 'masterfila', nome: 'WZ MasterFila' },
  { chave: 'agenda', nome: 'WZ Agenda' },
];
// 'agenda' fica NO catálogo mas desabilitada p/ o demo — prova o 403 do guard.
const ENABLED_FOR_DEMO = ['masterfila'];

async function main(): Promise<void> {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  const pool = createCorePool(cfg.coreDatabaseUrl);
  const db = createCoreDb(pool);

  // 1. Plano.
  let [plan] = await db.select().from(plans).where(eq(plans.nome, PLAN_NAME)).limit(1);
  if (!plan) {
    [plan] = await db.insert(plans).values({ nome: PLAN_NAME, limites: PLAN_LIMITS }).returning();
    console.log(`[seed-licensing] plano "${PLAN_NAME}" criado`);
  } else {
    await db.update(plans).set({ limites: PLAN_LIMITS }).where(eq(plans.id, plan.id));
    console.log(`[seed-licensing] plano "${PLAN_NAME}" atualizado`);
  }
  if (!plan) throw new Error('[seed-licensing] falha ao criar o plano');

  // 2. Catálogo de módulos.
  for (const mod of MODULE_CATALOG) {
    await db.insert(modules).values(mod).onConflictDoNothing();
  }
  console.log(
    `[seed-licensing] catálogo de módulos: ${MODULE_CATALOG.map((m) => m.chave).join(', ')}`,
  );

  // 3. Tenant demo recebe o plano.
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.subdominio, SUBDOMAIN))
    .limit(1);
  if (!tenant)
    throw new Error(`[seed-licensing] tenant "${SUBDOMAIN}" não existe — rode db:seed-demo`);
  await db.update(tenants).set({ planId: plan.id }).where(eq(tenants.id, tenant.id));

  // 4. Módulos habilitados para o tenant.
  for (const chave of ENABLED_FOR_DEMO) {
    const [mod] = await db.select().from(modules).where(eq(modules.chave, chave)).limit(1);
    if (mod) {
      await db
        .insert(tenantModules)
        .values({ tenantId: tenant.id, moduleId: mod.id })
        .onConflictDoNothing();
    }
  }
  console.log(
    `[seed-licensing] módulos habilitados p/ "${SUBDOMAIN}": ${ENABLED_FOR_DEMO.join(', ')}`,
  );

  // 5. Membership do admin no tenant.
  const [admin] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (!admin) throw new Error('[seed-licensing] admin não existe — rode db:seed-auth');
  await db
    .insert(memberships)
    .values({ userId: admin.id, tenantId: tenant.id, role: 'org_owner' })
    .onConflictDoNothing();
  console.log(`[seed-licensing] membership: ${ADMIN_EMAIL} → ${SUBDOMAIN} (org_owner)`);

  // 6. Usuário comum do tenant (sem papel de plataforma).
  let [operador] = await db.select().from(users).where(eq(users.email, OPERADOR_EMAIL)).limit(1);
  if (!operador) {
    [operador] = await db
      .insert(users)
      .values({
        email: OPERADOR_EMAIL,
        senhaHash: await hashPassword(OPERADOR_PASSWORD),
        status: 'ativo',
        // platformRole fica NULL de propósito.
      })
      .returning();
    console.log(`[seed-licensing] operador criado (${OPERADOR_EMAIL} / ${OPERADOR_PASSWORD})`);
  }
  if (operador) {
    await db
      .insert(memberships)
      .values({ userId: operador.id, tenantId: tenant.id, role: 'org_member' })
      .onConflictDoNothing();
    console.log(`[seed-licensing] membership: ${OPERADOR_EMAIL} → ${SUBDOMAIN} (org_member)`);
  }

  await pool.end();
  console.log('[seed-licensing] concluído');
}

main().catch((err) => {
  console.error('[seed-licensing] falhou:', err);
  process.exit(1);
});
