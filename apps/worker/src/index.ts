import { Queue } from 'bullmq'
import { env } from './env.js'

const connection = { url: env.REDIS_URL }

/**
 * Filas do worker (ADR 0011). Processors reais (emissão de NF-e, retry de
 * webhook) são adicionados pela Frente B — este scaffold só conecta e
 * declara as filas para confirmar que a infra (Redis) está acessível.
 */
export const nfeQueue = new Queue('nfe-jobs', { connection })
export const webhookRetryQueue = new Queue('webhook-retries', { connection })

console.log('wz-connect worker connected to Redis, queues ready.')
