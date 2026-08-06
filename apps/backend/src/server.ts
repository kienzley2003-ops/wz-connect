import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './env.js'

const API = '/api/v1'

const app = Fastify({
  logger: env.NODE_ENV !== 'test',
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

// Rate limiting global (ADR 0012): 200/min, 10/min em /auth/login (aplicado
// por rota quando a Frente A registrar /auth/*).
await app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
})

app.get(`${API}/health`, async () => ({ status: 'ok' }))

// Rotas de negócio (auth, billing, etc.) são registradas pelas frentes
// paralelas — ver docs/pendencias e o plano de divisão do MVP.

const port = env.PORT
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
