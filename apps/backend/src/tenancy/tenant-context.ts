import { AsyncLocalStorage } from 'node:async_hooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** Instância Drizzle do banco do tenant (schema definido pelos módulos). */
export type TenantDb = NodePgDatabase<Record<string, never>>;

export interface TenantContext {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly db: TenantDb;
}

/** Store mutável: aberto no início da request e preenchido após resolver o tenant. */
interface TenantStore {
  context?: TenantContext;
}

const storage = new AsyncLocalStorage<TenantStore>();

/** Executa `fn` com o contexto do tenant já resolvido (uso direto/testes). */
export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run({ context }, fn);
}

/**
 * Abre um escopo de tenant (store vazio) que envolve o resto da request e chama `fn`.
 * Padrão compatível com Fastify: usar `storage.run(store, done)` num hook `onRequest`,
 * garantindo que o store persista até o handler (o que o `enterWith` não faz através
 * da fronteira do hook assíncrono).
 */
export function runTenantScope(fn: () => void): void {
  storage.run({}, fn);
}

/**
 * Define o contexto do tenant no escopo atual (aberto por {@link runTenantScope}).
 * @throws Error se chamado fora de um escopo.
 */
export function setTenantContext(context: TenantContext): void {
  const store = storage.getStore();
  if (!store) {
    throw new Error('Escopo de tenant não iniciado (runTenantScope ausente)');
  }
  store.context = context;
}

/** Retorna o contexto do tenant atual, ou `undefined` se ausente. */
export function tryGetTenantContext(): TenantContext | undefined {
  return storage.getStore()?.context;
}

/**
 * Retorna o contexto do tenant atual.
 * @throws Error se não houver tenant resolvido no escopo.
 */
export function getTenantContext(): TenantContext {
  const context = storage.getStore()?.context;
  if (!context) {
    throw new Error('Contexto de tenant indisponível fora de uma request resolvida');
  }
  return context;
}

/** Atalho para o banco do tenant atual. */
export function getTenantDb(): TenantDb {
  return getTenantContext().db;
}
