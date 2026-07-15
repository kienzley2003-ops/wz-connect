import { ModulesRegistry } from './modules.registry.js';
import { masterfilaModule } from './masterfila/index.js';
import { agendaModule } from './agenda/index.js';

/**
 * Composição do registry: lista explícita dos módulos disponíveis no runtime.
 *
 * Optamos por registro explícito em vez de `@fastify/autoload` (ver nota no
 * ADR-007): é determinístico, testável e não depende de convenção de diretório.
 * Adicionar um módulo = criar a pasta e registrá-lo aqui.
 */
export function createModulesRegistry(): ModulesRegistry {
  const registry = new ModulesRegistry();
  registry.register(masterfilaModule);
  registry.register(agendaModule);
  return registry;
}

export { ModulesRegistry } from './modules.registry.js';
export type { WzModule } from './module.contract.js';
