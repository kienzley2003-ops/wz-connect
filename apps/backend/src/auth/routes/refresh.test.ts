import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, sessions, memberships } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { issueCsrfToken } from '../services/csrf.service.js'
import { registerRefreshRoute } from './refresh.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions, refresh_tokens, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedSession() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'owner' })
  const { sessionId, refreshToken } = await createOrRotateSession(db, user.id, org.id)
  return { org, user, sessionId, refreshToken }
}

describe('POST /api/v1/auth/refresh', () => {
  it('rotaciona o refresh token e emite um novo access token: 200', async () => {
    const { sessionId, refreshToken } = await seedSession()
    const csrf = issueCsrfToken()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { refresh_token: refreshToken, csrf },
    })

    expect(res.statusCode).toBe(200)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).toBeNull()
    await app.close()
  })

  it('rejeita com 403 quando o header X-CSRF-Token não confere com o cookie', async () => {
    const { refreshToken } = await seedSession()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': 'errado' },
      cookies: { refresh_token: refreshToken, csrf: issueCsrfToken() },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('rejeita com 401 quando não há cookie refresh_token', async () => {
    const csrf = issueCsrfToken()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { csrf },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('detecta replay: refresh token já revogado usado dentro de 5s revoga a sessão inteira', async () => {
    const { sessionId, refreshToken } = await seedSession()
    const csrf = issueCsrfToken()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { refresh_token: refreshToken, csrf },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { refresh_token: refreshToken, csrf },
    })

    expect(res.statusCode).toBe(401)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).not.toBeNull()
    await app.close()
  })
})
