import { findModule } from '@wz/shared';
import type { WzModule } from '../module.contract.js';

const meta = findModule('agenda');

/**
 * Módulo Agenda — esqueleto (Fase 3). Existe no catálogo mas fica desabilitado
 * para o tenant demo, exercitando o `403 module_not_enabled` do ADR-007.
 */
export const agendaModule: WzModule = {
  key: 'agenda',
  nome: meta?.label ?? 'Agenda',
  plugin: async (app) => {
    app.get('/ping', async () => ({ module: 'agenda', ok: true }));
  },
};
