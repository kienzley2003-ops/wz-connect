import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerMembershipsRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedOwnerSession(role = 'owner') {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const [membership] = await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role }).returning()
  const { sessionId } = await createOrRotateSession(db, user.id, org.id)
  return { org, user, membership, sessionId }
}

describe('memberships routes', () => {
  it('GET /memberships lista as memberships da org do token', async () => {
    const { org, sessionId, user } = await seedOwnerSession()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/memberships',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    await app.close()
  })

  it('POST /memberships cria uma membership quando o requester é owner/admin', async () => {
    const { org, sessionId, user } = await seedOwnerSession()
    const [newUser] = await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' }).returning()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/memberships',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { userId: newUser.id, role: 'viewer' },
    })

    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('POST /memberships rejeita com 403 quando o requester não é owner/admin', async () => {
    const { org, sessionId, user } = await seedOwnerSession('viewer')
    const [newUser] = await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' }).returning()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'viewer', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/memberships',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { userId: newUser.id, role: 'viewer' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('PUT /memberships/:id muda o role', async () => {
    const { org, sessionId, user, membership } = await seedOwnerSession()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/memberships/${membership.id}`,
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { role: 'admin' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('admin')
    await app.close()
  })
})
