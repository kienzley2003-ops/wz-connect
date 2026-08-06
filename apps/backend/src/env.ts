import { config } from 'dotenv'
import { resolve } from 'path'
import { z } from 'zod'

config({ path: resolve(process.cwd(), '../../.env') })

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
