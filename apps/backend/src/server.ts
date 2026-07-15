import { loadEnv } from './config/env.js';
import { loadDotenvIfPresent } from './config/load-dotenv.js';
import { buildApp } from './app.js';
import { createCorePool, createCoreDb } from './db/core/client.js';
import { checkCoreDb } from './db/core/health-check.js';
import { createTenantResolver } from './tenancy/create-tenant-resolver.js';
import { registerTenantResolution } from './tenancy/tenant-resolution.plugin.js';
import { registerTenantInfoRoute } from './routes/tenant-info.route.js';
import { createAuthModule } from './core/auth/create-auth.js';
import { createAuthGuard } from './core/auth/auth.guard.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerLicensingRoutes } from './routes/licensing.routes.js';
import { getTenantEntitlements } from './core/licensing/licensing.repository.js';
import { extractSubdomain } from './tenancy/subdomain.js';

// Versão do serviço (injetada pelo pnpm em runtime; fallback para dev/docker).
const APP_VERSION = process.env.npm_package_version ?? '0.0.0';

// Issuer dos tokens (estável entre assinatura e verificação).
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'wz-connect';

// Rotas de plataforma isentas de resolução de tenant (auth global, health, JWKS).
const EXEMPT_PREFIXES = ['/health', '/auth', '/.well-known'];
const isExempt = (url: string): boolean => {
  const path = url.split('?')[0] ?? url;
  return path === '/' || EXEMPT_PREFIXES.some((p) => path.startsWith(p));
};

async function main(): Promise<void> {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  const pool = createCorePool(cfg.coreDatabaseUrl);
  const coreDb = createCoreDb(pool);

  const app = buildApp({
    version: APP_VERSION,
    checkCoreDb: () => checkCoreDb(pool),
    logger: true,
  });

  // Fase 1: resolução de tenant por subdomínio.
  const resolver = createTenantResolver(coreDb, { kek: cfg.tenantCredentialsKek });
  registerTenantResolution(app, {
    resolver,
    baseDomain: process.env.BASE_DOMAIN,
    isExempt,
  });
  registerTenantInfoRoute(app);

  // Fase 2/3: autenticação global + licenciamento.
  try {
    const auth = await createAuthModule(coreDb, {
      kek: cfg.tenantCredentialsKek,
      issuer: JWT_ISSUER,
    });

    const getSubdomain = (request: { headers: { host?: string } }): string | null =>
      extractSubdomain(request.headers.host, process.env.BASE_DOMAIN);

    // Guard único: valida JWT + sessão única + binding subdomínio×tnt.
    const guard = createAuthGuard({
      verifyToken: auth.verifyToken,
      getActiveSessionId: auth.getActiveSessionId,
      getSubdomain,
    });

    registerAuthRoutes(app, auth, { guard, getSubdomain });
    registerLicensingRoutes(app, {
      guard,
      getTenantEntitlements: (subdomain) => getTenantEntitlements(coreDb, subdomain),
    });
  } catch (err) {
    app.log.warn(`Auth desabilitado: ${(err as Error).message}`);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Recebido ${signal}, encerrando...`);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  await app.listen({ port: cfg.port, host: cfg.host });
}

main().catch((err) => {
  console.error('[server] falha ao iniciar:', err);
  process.exit(1);
});
