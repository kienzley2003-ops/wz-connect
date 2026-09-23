import { desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { organizations, subscriptions, plans, subscriptionStatusEnum, billingIntervalEnum } from '../db/schema.js'

const ENTITLED_STATUSES: (typeof subscriptionStatusEnum.enumValues)[number][] = ['trialing', 'active', 'past_due']

export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number]
export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number]

export interface SubscriptionSummary {
  planId: string
  planKey: string
  planName: string
  priceCents: number
  billingInterval: BillingInterval
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  trialEndsAt: Date | null
  canceledAt: Date | null
}

/** A mais recente assinatura da org, de qualquer status — o Org Admin
 * precisa ver mesmo uma assinatura cancelada/past_due, não só a ativa
 * (isso é trabalho do EntitlementsResolver, ver auth/services). */
export async function getCurrentSubscription(db: Db, organizationId: string): Promise<SubscriptionSummary | null> {
  const [row] = await db
    .select({
      planId: plans.id,
      planKey: plans.key,
      planName: plans.name,
      priceCents: plans.priceCents,
      billingInterval: plans.billingInterval,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      trialEndsAt: subscriptions.trialEndsAt,
      canceledAt: subscriptions.canceledAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.organizationId, organizationId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)
  return row ?? null
}

export interface DashboardSummary {
  totalOrganizations: number
  activeSubscriptions: number
  mrrCents: number
  newSignupsLast30Days: number
}

/** Dashboard global do Hub Admin — agrega direto no banco, sem cache;
 * volume esperado (dezenas/centenas de orgs) não justifica um job. */
export async function getDashboardSummary(db: Db): Promise<DashboardSummary> {
  const [{ totalOrganizations }] = await db
    .select({ totalOrganizations: sql<number>`count(*)::int` })
    .from(organizations)

  const activeSubs = await db
    .select({ priceCents: plans.priceCents, billingInterval: plans.billingInterval })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(inArray(subscriptions.status, ENTITLED_STATUSES))

  const mrrCents = activeSubs.reduce(
    (sum, s) => sum + (s.billingInterval === 'year' ? Math.round(s.priceCents / 12) : s.priceCents),
    0
  )

  const [{ newSignupsLast30Days }] = await db
    .select({ newSignupsLast30Days: sql<number>`count(*)::int` })
    .from(organizations)
    .where(gte(organizations.createdAt, sql`now() - interval '30 days'`))

  return {
    totalOrganizations,
    activeSubscriptions: activeSubs.length,
    mrrCents,
    newSignupsLast30Days,
  }
}
