import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, plans, subscriptions } from '../db/schema.js'
import { getCurrentSubscription } from './service.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, plans, subscriptions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('getCurrentSubscription', () => {
  it('retorna null quando a org nunca teve assinatura', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    expect(await getCurrentSubscription(db, org.id)).toBeNull()
  })

  it('retorna os dados do plano junto com o status da assinatura', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [plan] = await db
      .insert(plans)
      .values({ key: 'pro', name: 'Pro', priceCents: 9900, billingInterval: 'month' })
      .returning()
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: plan.id,
      stripeSubscriptionId: 'sub_teste_1',
      status: 'trialing',
    })

    const result = await getCurrentSubscription(db, org.id)

    expect(result).toMatchObject({ planKey: 'pro', planName: 'Pro', priceCents: 9900, status: 'trialing' })
  })

  it('retorna a assinatura mais recente quando há mais de uma', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [planA] = await db
      .insert(plans)
      .values({ key: 'free', name: 'Free', priceCents: 0, billingInterval: 'month' })
      .returning()
    const [planB] = await db
      .insert(plans)
      .values({ key: 'pro', name: 'Pro', priceCents: 9900, billingInterval: 'month' })
      .returning()
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planA.id,
      stripeSubscriptionId: 'sub_antiga',
      status: 'canceled',
    })
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planB.id,
      stripeSubscriptionId: 'sub_atual',
      status: 'active',
    })

    const result = await getCurrentSubscription(db, org.id)
    expect(result?.planKey).toBe('pro')
  })
})
