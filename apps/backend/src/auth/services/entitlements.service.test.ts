import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, plans, products, planProducts, subscriptions } from '../../db/schema.js'
import { stubEntitlementsResolver, createEntitlementsResolver } from './entitlements.service.js'
import { env } from '../../env.js'

describe('stubEntitlementsResolver', () => {
  it('retorna planId null e products vazio para qualquer organizationId', async () => {
    const result = await stubEntitlementsResolver.getActiveEntitlements('qualquer-org-id')
    expect(result).toEqual({ planId: null, products: [] })
  })
})

describe('createEntitlementsResolver', () => {
  let db: Db
  let pool: ReturnType<typeof createDb>['pool']

  beforeEach(async () => {
    ;({ db, pool } = createDb(env.DATABASE_URL))
    await db.execute(sql`TRUNCATE TABLE organizations, plans, products, plan_products, subscriptions CASCADE`)
  })

  afterAll(async () => {
    await pool.end()
  })

  it('retorna planId null e products vazio quando a org não tem assinatura', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const resolver = createEntitlementsResolver(db)

    const result = await resolver.getActiveEntitlements(org.id)

    expect(result).toEqual({ planId: null, products: [] })
  })

  it('retorna o plano e as keys dos produtos de uma assinatura trialing/active/past_due', async () => {
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
      stripeSubscriptionId: 'sub_teste_1',
      status: 'active',
    })

    const resolver = createEntitlementsResolver(db)
    const result = await resolver.getActiveEntitlements(org.id)

    expect(result).toEqual({ planId: plan.id, products: ['masterfila'] })
  })

  it('ignora assinaturas canceladas', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [plan] = await db
      .insert(plans)
      .values({ key: 'pro', name: 'Pro', priceCents: 9900, billingInterval: 'month' })
      .returning()
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: plan.id,
      stripeSubscriptionId: 'sub_teste_2',
      status: 'canceled',
    })

    const resolver = createEntitlementsResolver(db)
    const result = await resolver.getActiveEntitlements(org.id)

    expect(result).toEqual({ planId: null, products: [] })
  })
})
