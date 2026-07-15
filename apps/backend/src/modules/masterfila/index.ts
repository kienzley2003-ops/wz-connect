import { sql } from 'drizzle-orm';
import { findModule } from '@wz/shared';
import type { WzModule } from '../module.contract.js';
import { getTenantContext } from '../../tenancy/tenant-context.js';

const meta = findModule('masterfila');

/**
 * Módulo MasterFila — esqueleto (Fase 3). As rotas de negócio reais chegam na
 * Fase 5 (integração via `@wz/connect-sdk`, ADR-011). Aqui provamos que o
 * módulo opera sobre o banco isolado do tenant.
 */
export const masterfilaModule: WzModule = {
  key: 'masterfila',
  nome: meta?.label ?? 'MasterFila',
  plugin: async (app) => {
    app.get('/ping', async () => ({ module: 'masterfila', ok: true }));

    app.get('/info', async () => {
      const ctx = getTenantContext();
      const result = await ctx.db.execute(sql`select current_database() as database`);
      return {
        module: 'masterfila',
        tenant: ctx.subdomain,
        database: (result.rows[0] as { database: string } | undefined)?.database,
      };
    });
  },
};
