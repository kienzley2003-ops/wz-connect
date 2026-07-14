import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getTenantContext } from '../tenancy/tenant-context.js';

/**
 * Rota de demonstração (Fase 1): prova que a request resolveu o tenant e lê o
 * banco isolado dele. Retorna o nome do banco conectado (`current_database()`).
 */
export function registerTenantInfoRoute(app: FastifyInstance): void {
  app.get('/tenant/info', async () => {
    const ctx = getTenantContext();
    const result = await ctx.db.execute(sql`select current_database() as database`);
    const database = (result.rows[0] as { database: string } | undefined)?.database;
    return { tenantId: ctx.tenantId, subdomain: ctx.subdomain, database };
  });
}
