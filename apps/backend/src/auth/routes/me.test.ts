import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { registerMeRoute } from './me.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('GET /api/v1/auth/me', () => {
  it('retorna os dados do usuário autenticado: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    const app = await buildTestApp(db, (a) => registerMeRoute(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: user.id, email: 'a@acme.com', role: 'owner', org: org.id })
    await app.close()
  })

  it('rejeita com 401 sem cookie access_token', async () => {
    const app = await buildTestApp(db, (a) => registerMeRoute(a, db))
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
