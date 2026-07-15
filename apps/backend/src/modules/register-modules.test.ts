import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { registerModules } from './register-modules.js';
import { ModulesRegistry } from './modules.registry.js';
import type { WzModule } from './module.contract.js';

const masterfila: WzModule = {
  key: 'masterfila',
  nome: 'MasterFila',
  plugin: async (app) => {
    // Hook local: não pode vazar para outros módulos (encapsulamento).
    app.addHook('onSend', async (_req, reply, payload) => {
      reply.header('x-modulo', 'masterfila');
      return payload;
    });
    app.get('/ping', async () => ({ module: 'masterfila' }));
  },
};

const agenda: WzModule = {
  key: 'agenda',
  nome: 'Agenda',
  plugin: async (app) => {
    app.get('/ping', async () => ({ module: 'agenda' }));
  },
};

function buildApp(enabledMods: string[]) {
  const app = Fastify();
  const registry = new ModulesRegistry();
  registry.register(masterfila);
  registry.register(agenda);

  const guard = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    request.authUser = {
      id: 'u1',
      sid: 's1',
      tnt: 'demo',
      roles: ['org_owner'],
      mods: enabledMods,
    };
  };

  registerModules(app, { registry, guard });
  return app;
}

describe('registerModules', () => {
  it('registra as rotas do módulo sob /modules/<key>', async () => {
    const app = buildApp(['masterfila']);
    const res = await app.inject({ method: 'GET', url: '/modules/masterfila/ping' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ module: 'masterfila' });
    await app.close();
  });

  it('aplica o guard de módulo: 403 quando o tenant não tem o módulo', async () => {
    const app = buildApp(['masterfila']);
    const res = await app.inject({ method: 'GET', url: '/modules/agenda/ping' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'module_not_enabled', module: 'agenda' });
    await app.close();
  });

  it('libera o módulo quando o tenant passa a tê-lo habilitado', async () => {
    const app = buildApp(['masterfila', 'agenda']);
    const res = await app.inject({ method: 'GET', url: '/modules/agenda/ping' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('encapsula: hooks de um módulo não vazam para outro', async () => {
    const app = buildApp(['masterfila', 'agenda']);

    const mf = await app.inject({ method: 'GET', url: '/modules/masterfila/ping' });
    const ag = await app.inject({ method: 'GET', url: '/modules/agenda/ping' });

    expect(mf.headers['x-modulo']).toBe('masterfila');
    expect(ag.headers['x-modulo']).toBeUndefined();
    await app.close();
  });

  it('usa o prefixo configurado quando informado', async () => {
    const app = Fastify();
    const registry = new ModulesRegistry();
    registry.register(agenda);
    registerModules(app, {
      registry,
      guard: async (request) => {
        request.authUser = { id: 'u', sid: 's', roles: [], mods: ['agenda'] };
      },
      prefix: '/api/v1',
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/agenda/ping' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
