import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, sessions } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { issueCsrfToken } from '../services/csrf.service.js'
import { registerLogoutRoute } from './logout.js'
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

describe('POST /api/v1/auth/logout', () => {
  it('revoga a sessão e limpa os cookies: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    const app = await buildTestApp(db, (a) => registerLogoutRoute(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })
    const csrf = issueCsrfToken()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'x-csrf-token': csrf },
      cookies: { access_token: access, csrf },
    })

    expect(res.statusCode).toBe(200)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).not.toBeNull()
    await app.close()
  })

  it('rejeita com 403 sem o header X-CSRF-Token correspondente', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    const app = await buildTestApp(db, (a) => registerLogoutRoute(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { access_token: access, csrf: issueCsrfToken() },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('rejeita com 401 sem cookie access_token', async () => {
    const app = await buildTestApp(db, (a) => registerLogoutRoute(a, db))
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
