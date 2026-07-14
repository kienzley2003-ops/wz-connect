import { z } from 'zod';

/**
 * Schema das variáveis de ambiente do backend, chaveado pelos nomes crus.
 * Mantido puro (recebe a fonte por parâmetro) para ser 100% unit-testável.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  CORE_DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  TENANT_CREDENTIALS_KEK: z.string().min(32),
});

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly host: string;
  readonly coreDatabaseUrl: string;
  readonly jwtSecret: string;
  readonly tenantCredentialsKek: string;
}

/**
 * Valida e normaliza as variáveis de ambiente.
 * @throws Error com os nomes das variáveis inválidas quando a validação falha.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração de ambiente inválida — ${details}`);
  }

  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    coreDatabaseUrl: env.CORE_DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    tenantCredentialsKek: env.TENANT_CREDENTIALS_KEK,
  };
}
