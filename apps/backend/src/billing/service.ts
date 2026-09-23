import { desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { subscriptions, plans, subscriptionStatusEnum, billingIntervalEnum } from '../db/schema.js'

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
