import type { FastifyPluginAsync } from 'fastify';
import type { TenantDb } from '../tenancy/tenant-context.js';

/**
 * Contrato comum de um módulo de produto (ADR-007, padrão Adapter).
 * Todo módulo se declara da mesma forma; o registry e o registrador cuidam
 * do resto (prefixo, guards, habilitação por tenant).
 */
export interface WzModule {
  /** Chave do módulo — espelha `modules.chave` no CORE (ex.: 'masterfila'). */
  readonly key: string;
  /** Nome legível (catálogo compartilhado). */
  readonly nome: string;
  /** Rotas do módulo; registradas sob `/modules/<key>` num escopo encapsulado. */
  readonly plugin: FastifyPluginAsync;
  /** Seed inicial no banco do tenant, no provisionamento (Fase 4). */
  readonly seed?: (db: TenantDb) => Promise<void>;
}
