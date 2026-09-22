import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerImpersonationRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions, audit_events CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('POST /api/v1/impersonate/:organizationId', () => {
  it('super_admin recebe cookies de sessão da organização: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [superAdmin] = await db
      .insert(users)
      .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    const { sessionId } = await createOrRotateSession(db, superAdmin.id, null)
    const app = await buildTestApp(db, (a) => registerImpersonationRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/impersonate/${org.id}`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    const cookies = res.cookies.map((c) => c.name)
    expect(cookies).toEqual(expect.arrayContaining(['access_token', 'refresh_token', 'csrf']))
    await app.close()
  })

  it('rejeita com 403 quando o requester não é super_admin', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)
    const app = await buildTestApp(db, (a) => registerImpersonationRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/impersonate/${org.id}`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('rejeita com 404 quando a organização não existe', async () => {
    const [superAdmin] = await db
      .insert(users)
      .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    const { sessionId } = await createOrRotateSession(db, superAdmin.id, null)
    const app = await buildTestApp(db, (a) => registerImpersonationRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/impersonate/00000000-0000-0000-0000-000000000000',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
