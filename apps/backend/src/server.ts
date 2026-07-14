import { loadEnv } from './config/env.js';
import { loadDotenvIfPresent } from './config/load-dotenv.js';
import { buildApp } from './app.js';
import { createCorePool } from './db/core/client.js';
import { checkCoreDb } from './db/core/health-check.js';

// Versão do serviço (injetada pelo pnpm em runtime; fallback para dev/docker).
const APP_VERSION = process.env.npm_package_version ?? '0.0.0';

async function main(): Promise<void> {
  loadDotenvIfPresent();
  const cfg = loadEnv();
  const pool = createCorePool(cfg.coreDatabaseUrl);

  const app = buildApp({
    version: APP_VERSION,
    checkCoreDb: () => checkCoreDb(pool),
    logger: true,
  });

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
