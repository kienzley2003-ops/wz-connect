import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { registerOnboardingRoute } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('POST /api/v1/onboarding/organization', () => {
  it('cria a organização e loga o admin: 201 + cookies', async () => {
    const app = await buildTestApp(db, (a) => registerOnboardingRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/organization',
      headers: { host: env.BASE_DOMAIN },
      payload: {
        name: 'Acme',
        slug: 'acme',
        billing_email: 'billing@acme.com',
        admin: { email: 'owner@acme.com', password: 'Senha123!' },
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().organizationId).toBeTruthy()
    expect(res.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token', 'csrf'])
    )
    await app.close()
  })

  it('rejeita payload inválido com 400', async () => {
    const app = await buildTestApp(db, (a) => registerOnboardingRoute(a, db))
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/organization',
      headers: { host: env.BASE_DOMAIN },
      payload: { name: 'Acme' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})
