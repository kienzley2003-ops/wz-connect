import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createModuleGuard } from '../core/licensing/module.guard.js';
import type { ModulesRegistry } from './modules.registry.js';

export interface RegisterModulesDeps {
  readonly registry: ModulesRegistry;
  /** Guard de autenticação (precisa rodar antes do guard de módulo). */
  readonly guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** Prefixo base das rotas de módulo (default: `/modules`). */
  readonly prefix?: string;
}

/**
 * Registra cada módulo do registry como um **plugin Fastify encapsulado** sob
 * `<prefix>/<key>`, aplicando automaticamente o guard de autenticação e o de
 * módulo (ADR-007). O encapsulamento garante que hooks/decorators de um módulo
 * não vazem para os demais.
 */
export function registerModules(app: FastifyInstance, deps: RegisterModulesDeps): void {
  const prefix = deps.prefix ?? '/modules';

  for (const module of deps.registry.list()) {
    const moduleGuard = createModuleGuard(module.key);

    app.register(
      async (scope) => {
        scope.addHook('preHandler', deps.guard);
        scope.addHook('preHandler', moduleGuard);
        await scope.register(module.plugin);
      },
      { prefix: `${prefix}/${module.key}` },
    );
  }
}
