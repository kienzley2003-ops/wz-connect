import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Conveniência de dev: carrega o `.env` (do cwd ou da raiz do monorepo) se existir.
 * Em produção/Docker as variáveis vêm do ambiente do processo, não de arquivo.
 */
export function loadDotenvIfPresent(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
