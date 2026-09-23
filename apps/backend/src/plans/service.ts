import { desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { plans, planProducts, billingIntervalEnum } from '../db/schema.js'
import { PlanKeyTakenError, PlanNotFoundError } from '../lib/errors.js'

export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number]

export interface PlanRow {
  id: string
  key: string
  name: string
  priceCents: number
  billingInterval: BillingInterval
  createdAt: Date
}

export interface PlanProductEntry {
  productId: string
  limits: Record<string, number>
}

export interface PlanWithProductsRow extends PlanRow {
  products: PlanProductEntry[]
}

export interface PlanProductInput {
  productId: string
  limits?: Record<string, number>
}

export interface CreatePlanInput {
  key: string
  name: string
  priceCents: number
  billingInterval: BillingInterval
  products?: PlanProductInput[]
}

export interface UpdatePlanInput {
  name?: string
  priceCents?: number
  billingInterval?: BillingInterval
  products?: PlanProductInput[]
}

async function attachProducts(db: Db, plan: PlanRow): Promise<PlanWithProductsRow> {
  const rows = await db.select().from(planProducts).where(eq(planProducts.planId, plan.id))
  return { ...plan, products: rows.map((r) => ({ productId: r.productId, limits: r.limits })) }
}

export async function listPlans(db: Db): Promise<PlanWithProductsRow[]> {
  const planRows = await db.select().from(plans).orderBy(desc(plans.createdAt))
  const productRows = await db.select().from(planProducts)
  return planRows.map((plan) => ({
    ...plan,
    products: productRows
      .filter((pp) => pp.planId === plan.id)
      .map((pp) => ({ productId: pp.productId, limits: pp.limits })),
  }))
}

export async function getPlanById(db: Db, id: string): Promise<PlanWithProductsRow> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1)
  if (!plan) {
    throw new PlanNotFoundError()
  }
  return attachProducts(db, plan)
}

export async function createPlan(db: Db, input: CreatePlanInput): Promise<PlanWithProductsRow> {
  const [existing] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, input.key)).limit(1)
  if (existing) {
    throw new PlanKeyTakenError()
  }

  const plan = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(plans)
      .values({
        key: input.key,
        name: input.name,
        priceCents: input.priceCents,
        billingInterval: input.billingInterval,
      })
      .returning()
    if (input.products && input.products.length > 0) {
      await tx.insert(planProducts).values(
        input.products.map((p) => ({ planId: row.id, productId: p.productId, limits: p.limits ?? {} }))
      )
    }
    return row
  })

  return attachProducts(db, plan)
}

export async function updatePlan(db: Db, id: string, updates: UpdatePlanInput): Promise<PlanWithProductsRow> {
  const [existing] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, id)).limit(1)
  if (!existing) {
    throw new PlanNotFoundError()
  }

  await db.transaction(async (tx) => {
    if (updates.name !== undefined || updates.priceCents !== undefined || updates.billingInterval !== undefined) {
      await tx
        .update(plans)
        .set({
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.priceCents !== undefined ? { priceCents: updates.priceCents } : {}),
          ...(updates.billingInterval !== undefined ? { billingInterval: updates.billingInterval } : {}),
        })
        .where(eq(plans.id, id))
    }
    if (updates.products !== undefined) {
      await tx.delete(planProducts).where(eq(planProducts.planId, id))
      if (updates.products.length > 0) {
        await tx.insert(planProducts).values(
          updates.products.map((p) => ({ planId: id, productId: p.productId, limits: p.limits ?? {} }))
        )
      }
    }
  })

  return getPlanById(db, id)
}
