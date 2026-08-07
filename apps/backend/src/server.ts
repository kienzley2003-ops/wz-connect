import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import { env } from './env.js'
import { createDb } from './db/client.js'
import { registerAuthPlugin } from './auth/plugin.js'
import { registerTenancyPlugin } from './tenancy/plugin.js'
import { registerLoginRoute } from './auth/routes/login.js'
import { registerMfaChallengeRoute } from './auth/routes/mfa-challenge.js'
import { registerRefreshRoute } from './auth/routes/refresh.js'
import { registerLogoutRoute } from './auth/routes/logout.js'
import { registerMeRoute } from './auth/routes/me.js'
import { registerMfaRoutes } from './auth/routes/mfa.js'
import { AppError } from './lib/errors.js'

const API = '/api/v1'

const app = Fastify({
  logger: env.NODE_ENV !== 'test',
})

const { db } = createDb(env.DATABASE_URL)

await app.register(helmet)
await app.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) {
      return cb(null, true)
    }
    const host = new URL(origin).hostname
    if (host === env.BASE_DOMAIN || host.endsWith(`.${env.BASE_DOMAIN}`)) {
      return cb(null, true)
    }
    cb(new Error('Not allowed by CORS'), false)
  },
})

await app.register(swagger, {
  openapi: {
    info: {
      title: 'WZ Connect API',
      version: '0.1.0',
      description: 'Auth + Tenancy + Catálogo/Planos do wz-hub',
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
})
await app.register(swaggerUi, {
  routePrefix: `${API}/docs`,
  uiConfig: { docExpansion: 'list' },
})

// Rate limiting global (ADR 0012): 200/min; /auth/login sobrescreve para
// 10/min via config de rota (ver auth/routes/login.ts).
await app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
})

await registerAuthPlugin(app)
await registerTenancyPlugin(app, db, { publicPaths: [`${API}/health`, `${API}/docs`] })

app.setErrorHandler((err, request, reply) => {
  if (err instanceof AppError) {
    request.log.warn({ code: err.code, statusCode: err.statusCode }, err.message)
    return reply
      .status(err.statusCode)
      .send({ error: { code: err.code, message: err.message, details: err.details } })
  }
  if ((err as { statusCode?: number }).statusCode === 429) {
    return reply
      .status(429)
      .send({ error: { code: 'rate-limit', message: 'Muitas requisições. Tente novamente em instantes.' } })
  }
  request.log.error({ err }, 'Unhandled error')
  return reply.status(500).send({ error: { code: 'internal', message: 'Erro interno. Tente novamente.' } })
})

app.get(`${API}/health`, async () => ({ status: 'ok' }))

await registerLoginRoute(app, db)
await registerMfaChallengeRoute(app, db)
await registerRefreshRoute(app, db)
await registerLogoutRoute(app, db)
await registerMeRoute(app, db)
await registerMfaRoutes(app, db)

const port = env.PORT
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
