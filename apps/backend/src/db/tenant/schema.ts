import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Schema do banco de CADA tenant (ADR-004/009).
 *
 * Conjunto de migração separado do CORE: é aplicado a N bancos pelo
 * `tenant-migrator`. As tabelas dos módulos de produto entram aqui (Fase 5) —
 * um schema combinado por tenant evita problemas de ordenação entre módulos.
 *
 * Toda mudança de forma segue **expand/contract** (ADR-009): nunca renomear ou
 * remover na mesma migração que introduz a forma nova.
 */

/** Identifica o tenant dentro do próprio banco (útil em backup/restore e debug). */
export const tenantInfo = pgTable('tenant_info', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** `tenants.id` no WZ_CONNECT_CORE. */
  tenantId: uuid('tenant_id').notNull(),
  subdominio: text('subdominio').notNull(),
  provisionadoEm: timestamp('provisionado_em', { withTimezone: true }).notNull().defaultNow(),
});
