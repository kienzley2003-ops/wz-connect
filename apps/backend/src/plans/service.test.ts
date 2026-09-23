import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { plans, products } from '../db/schema.js'
import { listPlans, getPlanById, createPlan, updatePlan } from './service.js'
import { PlanKeyTakenError, PlanNotFoundError } from '../lib/errors.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE plans, products, plan_products CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedProduct(key = 'masterfila') {
  const [product] = await db.insert(products).values({ key, name: key }).returning()
  return product
}

describe('createPlan', () => {
  it('cria um plano sem produtos associados', async () => {
    const plan = await createPlan(db, { key: 'free', name: 'Free', priceCents: 0, billingInterval: 'month' })
    expect(plan.key).toBe('free')
    expect(plan.products).toEqual([])
  })

  it('cria um plano com produtos e limites associados', async () => {
    const product = await seedProduct()
    const plan = await createPlan(db, {
      key: 'pro',
      name: 'Pro',
      priceCents: 9900,
      billingInterval: 'month',
      products: [{ productId: product.id, limits: { tickets: 100 } }],
    })
    expect(plan.products).toEqual([{ productId: product.id, limits: { tickets: 100 } }])
  })

  it('lança PlanKeyTakenError quando a key já existe', async () => {
    await createPlan(db, { key: 'free', name: 'Free', priceCents: 0, billingInterval: 'month' })
    await expect(
      createPlan(db, { key: 'free', name: 'Free 2', priceCents: 0, billingInterval: 'month' })
    ).rejects.toThrow(PlanKeyTakenError)
  })
})

describe('listPlans', () => {
  it('lista todos os planos com seus produtos', async () => {
    const product = await seedProduct()
    await createPlan(db, {
      key: 'pro',
      name: 'Pro',
      priceCents: 9900,
      billingInterval: 'month',
      products: [{ productId: product.id }],
    })
    await createPlan(db, { key: 'free', name: 'Free', priceCents: 0, billingInterval: 'month' })

    const rows = await listPlans(db)

    expect(rows).toHaveLength(2)
    const pro = rows.find((r) => r.key === 'pro')
    expect(pro?.products).toHaveLength(1)
  })
})

describe('getPlanById', () => {
  it('lança PlanNotFoundError quando o id não existe', async () => {
    await expect(getPlanById(db, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      PlanNotFoundError
    )
  })
})

describe('updatePlan', () => {
  it('atualiza o preço sem mexer nos produtos associados', async () => {
    const product = await seedProduct()
    const plan = await createPlan(db, {
      key: 'pro',
      name: 'Pro',
      priceCents: 9900,
      billingInterval: 'month',
      products: [{ productId: product.id, limits: { tickets: 100 } }],
    })

    const updated = await updatePlan(db, plan.id, { priceCents: 12900 })

    expect(updated.priceCents).toBe(12900)
    expect(updated.products).toEqual([{ productId: product.id, limits: { tickets: 100 } }])
  })

  it('substitui os produtos associados quando products é informado', async () => {
    const productA = await seedProduct('masterfila')
    const productB = await seedProduct('desk')
    const plan = await createPlan(db, {
      key: 'pro',
      name: 'Pro',
      priceCents: 9900,
      billingInterval: 'month',
      products: [{ productId: productA.id }],
    })

    const updated = await updatePlan(db, plan.id, { products: [{ productId: productB.id, limits: { seats: 5 } }] })

    expect(updated.products).toEqual([{ productId: productB.id, limits: { seats: 5 } }])
  })

  it('lança PlanNotFoundError quando o id não existe', async () => {
    await expect(
      updatePlan(db, '00000000-0000-0000-0000-000000000000', { priceCents: 100 })
    ).rejects.toThrow(PlanNotFoundError)
  })
})
