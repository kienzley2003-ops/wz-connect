import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Schema do banco central WZ_CONNECT_CORE (ADR-004).
 * Guarda o que é global: auth, tenants, planos, módulos, subdomínios e
 * as credenciais (cifradas) dos bancos de cada tenant.
 *
 * Os enums replicam as constantes de `@wz/shared` no nível do banco.
 */

export const tenantStatusEnum = pgEnum('tenant_status', [
  'provisionando',
  'ativo',
  'suspenso',
  'encerrado',
]);

export const orgRoleEnum = pgEnum('org_role', ['org_owner', 'org_admin', 'org_member']);

export const userStatusEnum = pgEnum('user_status', ['ativo', 'bloqueado', 'desativado']);

export const signingKeyStatusEnum = pgEnum('signing_key_status', ['active', 'retiring', 'revoked']);

/** Planos disponíveis (só registro de plano; sem gateway de pagamento). */
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  limites: jsonb('limites').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Empresas (tenants) — raiz multi-tenant. */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    slug: text('slug').notNull(),
    subdominio: text('subdominio').notNull(),
    status: tenantStatusEnum('status').notNull().default('provisionando'),
    planId: uuid('plan_id').references(() => plans.id),
    // Placement do banco (ADR-005): rótulo do servidor onde o banco vive.
    dbPlacement: text('db_placement').notNull().default('default'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex('tenants_slug_idx').on(t.slug),
    subdominioIdx: uniqueIndex('tenants_subdominio_idx').on(t.subdominio),
  }),
);

/** Credenciais (cifradas) do banco de cada tenant (ADR-006). */
export const tenantDatabases = pgTable('tenant_databases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  host: text('host').notNull(),
  porta: integer('porta').notNull().default(5432),
  dbname: text('dbname').notNull(),
  usuario: text('usuario').notNull(),
  // iv + ciphertext + authTag (AES-256-GCM) — nunca em texto puro.
  senhaCifrada: text('senha_cifrada').notNull(),
  servidor: text('servidor').notNull().default('default'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Identidade global de usuário (autenticação centralizada no CORE). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    senhaHash: text('senha_hash').notNull(),
    status: userStatusEnum('status').notNull().default('ativo'),
    tentativasLogin: integer('tentativas_login').notNull().default(0),
    bloqueadoAte: timestamp('bloqueado_ate', { withTimezone: true }),
    sessaoAtivaId: uuid('sessao_ativa_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

/** Vínculo N:N usuário↔tenant, com papel na organização. */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('org_member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTenantIdx: uniqueIndex('memberships_user_tenant_idx').on(t.userId, t.tenantId),
  }),
);

/** Catálogo de módulos de produto. */
export const modules = pgTable(
  'modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chave: text('chave').notNull(),
    nome: text('nome').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    chaveIdx: uniqueIndex('modules_chave_idx').on(t.chave),
  }),
);

/** Módulos habilitados por tenant (+ config). */
export const tenantModules = pgTable(
  'tenant_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantModuleIdx: uniqueIndex('tenant_modules_tenant_module_idx').on(t.tenantId, t.moduleId),
  }),
);

/** Chaves de assinatura de JWT (rotação + JWKS — ADR-008). */
export const signingKeys = pgTable(
  'signing_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kid: text('kid').notNull(),
    publicPem: text('public_pem').notNull(),
    // Chave privada cifrada (mesma KEK do ADR-006).
    privatePemCifrada: text('private_pem_cifrada').notNull(),
    status: signingKeyStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kidIdx: uniqueIndex('signing_keys_kid_idx').on(t.kid),
  }),
);

/** Trilha de auditoria da plataforma. */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  action: text('action').notNull(),
  entity: text('entity'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  ip: text('ip'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
