import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { users, organizations } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerFeatureFlagsRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE users, organizations, feature_flags, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedSuperAdminSession() {
  const [superAdmin] = await db
    .insert(users)
    .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
    .returning()
  const { sessionId } = await createOrRotateSession(db, superAdmin.id, null)
  return { superAdmin, sessionId }
}

describe('PUT /api/v1/feature-flags', () => {
  it('super_admin liga um flag pra uma org: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const { superAdmin, sessionId } = await seedSuperAdminSession()
    const app = await buildTestApp(db, (a) => registerFeatureFlagsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/feature-flags',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { organizationId: org.id, key: 'beta-dashboard', enabled: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().enabled).toBe(true)
    await app.close()
  })

  it('rejeita com 403 quando o requester não é super_admin', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)
    const app = await buildTestApp(db, (a) => registerFeatureFlagsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/feature-flags',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { organizationId: org.id, key: 'beta-dashboard', enabled: true },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})

describe('GET /api/v1/feature-flags', () => {
  it('super_admin lista os flags de uma org: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const { superAdmin, sessionId } = await seedSuperAdminSession()
    const app = await buildTestApp(db, (a) => registerFeatureFlagsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    await app.inject({
      method: 'PUT',
      url: '/api/v1/feature-flags',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { organizationId: org.id, key: 'beta-dashboard', enabled: true },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/feature-flags?organizationId=${org.id}`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    await app.close()
  })
})
