import { loadEnv } from './config/env.js';
import { loadDotenvIfPresent } from './config/load-dotenv.js';
import { buildApp } from './app.js';
import { createCorePool, createCoreDb } from './db/core/client.js';
import { checkCoreDb } from './db/core/health-check.js';
import { createTenantResolver } from './tenancy/create-tenant-resolver.js';
import { registerTenantResolution } from './tenancy/tenant-resolution.plugin.js';
import { registerTenantInfoRoute } from './routes/tenant-info.route.js';

// Versão do serviço (injetada pelo pnpm em runtime; fallback para dev/docker).
const APP_VERSION = process.env.npm_package_version ?? '0.0.0';

// Rotas de plataforma isentas de resolução de tenant.
const EXEMPT_PREFIXES = ['/health', '/'];
const isExempt = (url: string): boolean => {
  const path = url.split('?')[0] ?? url;
  return path === '/' || EXEMPT_PREFIXES.some((p) => p !== '/' && path.startsWith(p));
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
