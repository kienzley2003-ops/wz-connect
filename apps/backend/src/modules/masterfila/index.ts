import { sql } from 'drizzle-orm';
import { findModule } from '@wz/shared';
import type { WzModule } from '../module.contract.js';
import { getTenantContext } from '../../tenancy/tenant-context.js';

const meta = findModule('masterfila');

/**
 * **Console** do MasterFila dentro do WZ Connect (ADR-011).
 *
 * O que ESTÁ aqui: a superfície de administração do produto para o tenant —
 * status, configuração, diagnóstico. É o que o operador vê no console do Connect.
 *
 * O que NÃO está aqui: as rotas de negócio (filas, guichês, tickets). O
 * MasterFila roda como **aplicação separada** e fala com o banco do tenant com
 * a credencial dedicada que recebeu no provisionamento, usando `@wz/connect-sdk`
 * para identidade e licenciamento.
 */
export const masterfilaModule: WzModule = {
  key: 'masterfila',
  nome: meta?.label ?? 'MasterFila',
  plugin: async (app) => {
    /** Diagnóstico: o console enxerga o mesmo banco isolado que o produto usa. */
    app.get('/status', async () => {
      const ctx = getTenantContext();
      const result = await ctx.db.execute(sql`select current_database() as database`);
      return {
        module: 'masterfila',
        tenant: ctx.subdomain,
        database: (result.rows[0] as { database: string } | undefined)?.database,
        console: true,
      };
    });
  },
};
