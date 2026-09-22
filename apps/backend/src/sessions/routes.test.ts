import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, sessions } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerSessionsRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('GET /api/v1/sessions', () => {
  it('lista as sessões ativas do usuário autenticado: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)
    const app = await buildTestApp(db, (a) => registerSessionsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sessions',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    await app.close()
  })
})

describe('POST /api/v1/sessions/:id/revoke', () => {
  it('revoga uma sessão própria: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const currentSession = await createOrRotateSession(db, user.id, null)
    const otherSession = await createOrRotateSession(db, user.id, org.id)
    const app = await buildTestApp(db, (a) => registerSessionsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({
      sub: user.id,
      org: null,
      role: 'super_admin',
      session: currentSession.sessionId,
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${otherSession.sessionId}/revoke`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    const [row] = await db.select().from(sessions).where(eq(sessions.id, otherSession.sessionId))
    expect(row.revokedAt).not.toBeNull()
    await app.close()
  })

  it('rejeita com 403 ao tentar revogar sessão de outro usuário', async () => {
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const [otherUser] = await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' }).returning()
    const mySession = await createOrRotateSession(db, user.id, null)
    const notMySession = await createOrRotateSession(db, otherUser.id, null)
    const app = await buildTestApp(db, (a) => registerSessionsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({
      sub: user.id,
      org: null,
      role: 'super_admin',
      session: mySession.sessionId,
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${notMySession.sessionId}/revoke`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})
