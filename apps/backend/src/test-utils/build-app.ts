import Fastify, { type FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import type { Db } from '../db/client.js'
import { registerTenancyPlugin } from '../tenancy/plugin.js'
import { AppError } from '../lib/errors.js'
import { env } from '../env.js'

export async function buildTestApp(
  db: Db,
  registerRoutes: (app: FastifyInstance) => Promise<void>
): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  })
  await registerTenancyPlugin(app, db, { publicPaths: ['/api/v1/health'] })
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } })
    }
    request.log.error({ err }, 'Unhandled error in test app')
    return reply.status(500).send({ error: { code: 'internal', message: 'Erro interno' } })
  })
  await registerRoutes(app)
  await app.ready()
  return app
}
