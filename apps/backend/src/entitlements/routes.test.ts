import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, products, plans, planProducts, subscriptions } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerEntitlementsRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(
    sql`TRUNCATE TABLE organizations, users, products, plans, plan_products, subscriptions, sessions CASCADE`
  )
})

afterAll(async () => {
  await pool.end()
})

async function seedActiveSubscription() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [product] = await db.insert(products).values({ key: 'masterfila', name: 'Master Fila' }).returning()
  const [plan] = await db
    .insert(plans)
    .values({ key: 'pro', name: 'Pro', priceCents: 9900, billingInterval: 'month' })
    .returning()
  await db.insert(planProducts).values({ planId: plan.id, productId: product.id, limits: {} })
  await db.insert(subscriptions).values({
    organizationId: org.id,
    planId: plan.id,
    stripeSubscriptionId: 'sub_teste',
    status: 'active',
  })
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const { sessionId } = await createOrRotateSession(db, user.id, org.id)
  return { org, plan, user, sessionId }
}

describe('GET /api/v1/entitlements', () => {
  it('retorna o plano e os produtos da assinatura ativa: 200', async () => {
    const { org, plan, user, sessionId } = await seedActiveSubscription()
    const app = await buildTestApp(db, (a) => registerEntitlementsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/entitlements?organizationId=${org.id}`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ planId: plan.id, products: ['masterfila'] })
    await app.close()
  })

  it('rejeita com 401 sem sessão', async () => {
    const app = await buildTestApp(db, (a) => registerEntitlementsRoutes(a, db))
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/entitlements?organizationId=00000000-0000-0000-0000-000000000000`,
      headers: { host: env.BASE_DOMAIN },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

describe('GET /api/v1/entitlements/check', () => {
  it('retorna allowed=true quando o produto está no plano ativo', async () => {
    const { org, user, sessionId } = await seedActiveSubscription()
    const app = await buildTestApp(db, (a) => registerEntitlementsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/entitlements/check?organizationId=${org.id}&product=masterfila`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ allowed: true })
    await app.close()
  })

  it('retorna allowed=false para um produto fora do plano', async () => {
    const { org, user, sessionId } = await seedActiveSubscription()
    const app = await buildTestApp(db, (a) => registerEntitlementsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/entitlements/check?organizationId=${org.id}&product=desk`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ allowed: false })
    await app.close()
  })
})
