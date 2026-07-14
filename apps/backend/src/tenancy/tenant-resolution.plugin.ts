import type { FastifyInstance } from 'fastify';
import { extractSubdomain } from './subdomain.js';
import { runTenantScope, setTenantContext } from './tenant-context.js';
import { TenantResolver } from './tenant-resolver.js';
import { TenantNotFoundError } from './errors.js';

export interface TenantResolutionOptions {
  readonly resolver: TenantResolver;
  /** Domínio base para extrair o subdomínio (ex.: `wzconnect.com`). */
  readonly baseDomain?: string;
  /** Rotas isentas de resolução de tenant (ex.: health, docs, auth de plataforma). */
  readonly isExempt?: (url: string) => boolean;
}

/**
 * Registra o hook `onRequest` que resolve o tenant pelo subdomínio e entra no
 * contexto (AsyncLocalStorage) antes do handler. Não encapsula: aplica-se a
 * toda a instância onde for registrado.
 */
export function registerTenantResolution(
  app: FastifyInstance,
  options: TenantResolutionOptions,
): void {
  // Hook 1: abre o escopo (store mutável) que envolve toda a request.
  app.addHook('onRequest', (_request, _reply, done) => {
    runTenantScope(done);
  });

  // Hook 2: resolve o tenant e preenche o contexto no escopo aberto acima.
  app.addHook('onRequest', async (request, reply) => {
    if (options.isExempt?.(request.url)) return;

    const subdomain = extractSubdomain(request.headers.host, options.baseDomain);
    if (!subdomain) {
      await reply.code(400).send({ error: 'tenant_subdomain_required' });
      return;
    }

    try {
      const context = await options.resolver.resolve(subdomain);
      setTenantContext(context);
    } catch (err) {
      if (err instanceof TenantNotFoundError) {
        await reply.code(404).send({ error: 'tenant_not_found', subdomain });
        return;
      }
      throw err;
    }
  });
}
