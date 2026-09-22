import { config } from 'dotenv'
import { resolve } from 'path'
import { z } from 'zod'

const ROOT = resolve(process.cwd(), '../..')

config({ path: resolve(ROOT, '.env') })

// Vitest seta NODE_ENV=test automaticamente — quando isso acontece,
// .env.test sobrepõe só o que ele definir (hoje, só DATABASE_URL), para
// que a suíte de testes nunca escreva no banco de desenvolvimento. Ver
// docs/superpowers/plans/2026-08-07-connect-session-tenancy-infra.md
// linha 16: era assim que a troca para um banco dedicado já estava prevista.
if (process.env.NODE_ENV === 'test') {
  config({ path: resolve(ROOT, '.env.test'), override: true })
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  /** Stripe (ADR 0009) — billing e webhook. */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** NFe.io (ADR 0010) — emissão de nota fiscal. */
  NFEIO_API_KEY: z.string().optional(),
  /** Domínio base para resolução de tenant por subdomínio (ADR 0003). */
  BASE_DOMAIN: z.string().default('localhost'),
})

export const env = envSchema.parse(process.env)
