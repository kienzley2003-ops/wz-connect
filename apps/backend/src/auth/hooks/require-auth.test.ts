import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import { eq, sql } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, sessions } from '../../db/schema.js'
import { createTokenService } from '../services/token.service.js'
import { createRequireAuth } from './require-auth.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { AppError } from '../../lib/errors.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']
let app: FastifyInstance

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions CASCADE`)

  app = Fastify()
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  })
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } })
    }
    throw err
  })
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)
  app.get('/protected', { preHandler: requireAuth }, async (request: FastifyRequest) => ({
    authUser: (request as FastifyRequest & { authUser: unknown }).authUser,
  }))
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

async function seedUserOrgSession() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db
    .insert(users)
    .values({ email: 'admin@acme.com', passwordHash: 'x' })
    .returning()
  const [session] = await db
    .insert(sessions)
    .values({ userId: user.id, organizationId: org.id })
    .returning()
  return { org, user, session }
}

describe('createRequireAuth', () => {
  it('deixa passar e decora request.authUser com um token válido e sessão ativa', async () => {
    const { org, user, session } = await seedUserOrgSession()
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const token = await tokenService.signAccess({
      sub: user.id,
      org: org.id,
      role: 'owner',
      session: session.id,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { access_token: token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().authUser.sub).toBe(user.id)
  })

  it('rejeita com 401 session-revoked quando a sessão foi revogada', async () => {
    const { org, user, session } = await seedUserOrgSession()
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id))

    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const token = await tokenService.signAccess({
      sub: user.id,
      org: org.id,
      role: 'owner',
      session: session.id,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { access_token: token },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('session-revoked')
  })

  it('rejeita com 401 quando não há cookie access_token', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' })
    expect(res.statusCode).toBe(401)
  })

  it('rejeita com 401 quando o token é inválido', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { access_token: 'token-invalido' },
    })
    expect(res.statusCode).toBe(401)
  })
})
