import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { totp } from '../lib/totp.js'
import { registerMfaRoutes } from './mfa.js'
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

async function seedAuthedUser() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const { sessionId } = await createOrRotateSession(db, user.id, org.id)
  return { org, user, sessionId }
}

describe('mfa routes', () => {
  it('GET /mfa/setup retorna secret e otpauthUrl', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({ method: 'GET', url: '/api/v1/mfa/setup', cookies: { access_token: access } })

    expect(res.statusCode).toBe(200)
    expect(res.json().secret).toMatch(/^[A-Z2-7]+$/)
    await app.close()
  })

  it('POST /mfa/enable com código correto habilita MFA no banco', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const setupRes = await app.inject({ method: 'GET', url: '/api/v1/mfa/setup', cookies: { access_token: access } })
    const { secret } = setupRes.json()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mfa/enable',
      cookies: { access_token: access },
      payload: { secret, code: totp(secret) },
    })

    expect(res.statusCode).toBe(200)
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated.mfaEnabled).toBe(true)
    await app.close()
  })

  it('POST /mfa/enable com código errado retorna 401 mfa-invalid', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mfa/enable',
      cookies: { access_token: access },
      payload: { secret: 'JBSWY3DPEHPK3PXP', code: '000000' },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('POST /mfa/disable sem MFA habilitado retorna 400 mfa-not-enrolled', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mfa/disable',
      cookies: { access_token: access },
      payload: { code: '000000' },
    })

    expect(res.statusCode).toBe(400)
    await app.close()
  })
})
