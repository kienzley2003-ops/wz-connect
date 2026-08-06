import { config } from 'dotenv'
import { resolve } from 'path'
import { z } from 'zod'

config({ path: resolve(process.cwd(), '../../.env') })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  NFEIO_API_KEY: z.string().optional(),
})

export const env = envSchema.parse(process.env)
