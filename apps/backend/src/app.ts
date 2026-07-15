import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { buildHealth } from './services/health.service.js';

export interface RateLimitConfig {
  /** Teto global por IP na janela. */
  readonly global: number;
  /** Teto (mais agressivo) para `/auth/login`, por IP. */
  readonly login: number;
  /** Janela em milissegundos. */
  readonly timeWindow: number;
}

export interface AppDeps {
  /** Versão reportada no health check. */
  readonly version: string;
  /** Verifica a saúde do banco central WZ_CONNECT_CORE. */
  readonly checkCoreDb: () => Promise<boolean>;
  /** Habilita o logger do Fastify (default: desligado — útil em testes). */
  readonly logger?: boolean;
  /** Rate limit; omitido = desligado (default em testes). */
  readonly rateLimit?: RateLimitConfig;
  /** Publica a documentação OpenAPI em `/api/v1/docs`. */
  readonly docs?: boolean;
}

const SERVICE_NAME = 'wz-connect-backend';

/**
 * Monta a instância Fastify. Recebe as dependências por parâmetro
 * (health check do banco, versão, rate limit) para ser testável via `inject`.
 *
 * **Assíncrona de propósito:** `register()` é preguiçoso (só carrega no `ready()`),
 * enquanto rotas declaradas depois são criadas na hora e capturam apenas os hooks
 * já existentes. Sem o `await`, o rate limit não se aplicaria a estas rotas.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });

  // Defesa em profundidade: rate limit protege por IP; o lockout, por conta (ADR-008).
  if (deps.rateLimit) {
    await app.register(rateLimit, {
      global: true,
      max: deps.rateLimit.global,
      timeWindow: deps.rateLimit.timeWindow,
    });
  }

  // Swagger antes das rotas: só documenta o que for registrado depois dele.
  if (deps.docs) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'WZ Connect API',
          description: 'Control plane da suíte WZ',
          version: deps.version,
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
    });
    await app.register(swaggerUi, { routePrefix: '/api/v1/docs' });
  }

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
