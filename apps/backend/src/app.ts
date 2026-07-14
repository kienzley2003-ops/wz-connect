import Fastify, { type FastifyInstance } from 'fastify';
import { buildHealth } from './services/health.service.js';

export interface AppDeps {
  /** Versão reportada no health check. */
  readonly version: string;
  /** Verifica a saúde do banco central WZ_CONNECT_CORE. */
  readonly checkCoreDb: () => Promise<boolean>;
  /** Habilita o logger do Fastify (default: desligado — útil em testes). */
  readonly logger?: boolean;
}

const SERVICE_NAME = 'wz-connect-backend';

/**
 * Monta a instância Fastify. Recebe as dependências por parâmetro
 * (health check do banco, versão) para ser testável via `inject` sem I/O real.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

  app.get('/', async () => ({ name: SERVICE_NAME, version: deps.version }));

  app.get('/health', async () => {
    const coreDbHealthy = await deps.checkCoreDb();
    return buildHealth({
      service: SERVICE_NAME,
      version: deps.version,
      uptimeSeconds: Math.floor(process.uptime()),
      now: new Date(),
      coreDbHealthy,
    });
  });

  return app;
}
