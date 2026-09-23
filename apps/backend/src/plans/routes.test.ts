import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { users, plans, products } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerPlansRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE users, plans, products, plan_products, sessions CASCADE`)
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

describe('GET /api/v1/plans', () => {
  it('qualquer usuário autenticado pode listar: 200', async () => {
    await db.insert(plans).values({ key: 'free', name: 'Free', priceCents: 0, billingInterval: 'month' })
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, null)
    const app = await buildTestApp(db, (a) => registerPlansRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: null, role: 'viewer', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plans',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    await app.close()
  })
})

describe('POST /api/v1/plans', () => {
  it('super_admin cria um plano com produtos: 201', async () => {
    const { superAdmin, sessionId } = await seedSuperAdminSession()
    const [product] = await db.insert(products).values({ key: 'masterfila', name: 'Master Fila' }).returning()
    const app = await buildTestApp(db, (a) => registerPlansRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plans',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: {
        key: 'pro',
        name: 'Pro',
        priceCents: 9900,
        billingInterval: 'month',
        products: [{ productId: product.id, limits: { tickets: 100 } }],
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().products).toEqual([{ productId: product.id, limits: { tickets: 100 } }])
    await app.close()
  })

  it('rejeita com 403 quando o requester não é super_admin', async () => {
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, null)
    const app = await buildTestApp(db, (a) => registerPlansRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: null, role: 'viewer', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/plans',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { key: 'pro', name: 'Pro', priceCents: 9900, billingInterval: 'month' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})

describe('PUT /api/v1/plans/:id', () => {
  it('super_admin atualiza o preço de um plano: 200', async () => {
    const { superAdmin, sessionId } = await seedSuperAdminSession()
    const [plan] = await db
      .insert(plans)
      .values({ key: 'pro', name: 'Pro', priceCents: 9900, billingInterval: 'month' })
      .returning()
    const app = await buildTestApp(db, (a) => registerPlansRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/plans/${plan.id}`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { priceCents: 12900 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().priceCents).toBe(12900)
    await app.close()
  })
})
