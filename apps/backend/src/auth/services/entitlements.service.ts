import { and, eq, inArray } from 'drizzle-orm'
import type { EntitlementsResolver } from '@wz/shared'
import type { Db } from '../../db/client.js'
import { subscriptions, planProducts, products, subscriptionStatusEnum } from '../../db/schema.js'

export const stubEntitlementsResolver: EntitlementsResolver = {
  async getActiveEntitlements() {
    return { planId: null, products: [] }
  },
}

/** Assinaturas nestes status ainda dão direito de uso — mesmo conjunto do
 * partial unique index de `subscriptions` (ADR 0006, ver db/schema.ts). */
const ENTITLED_STATUSES: (typeof subscriptionStatusEnum.enumValues)[number][] = [
  'trialing',
  'active',
  'past_due',
]

/**
 * Implementação real do contrato (ver packages/shared/src/entitlements.ts)
 * — lê a assinatura ativa da organização e os produtos do plano dela.
 * Substitui `stubEntitlementsResolver` no composition root de cada rota
 * (ADR 0005: é assim que o claim `products[]` do JWT passa a refletir o
 * plano de verdade, em vez de vir sempre vazio).
 */
export function createEntitlementsResolver(db: Db): EntitlementsResolver {
  return {
    async getActiveEntitlements(organizationId) {
      const [subscription] = await db
        .select({ planId: subscriptions.planId })
        .from(subscriptions)
        .where(
          and(eq(subscriptions.organizationId, organizationId), inArray(subscriptions.status, ENTITLED_STATUSES))
        )
        .limit(1)

      if (!subscription) {
        return { planId: null, products: [] }
      }

      const rows = await db
        .select({ key: products.key })
        .from(planProducts)
        .innerJoin(products, eq(planProducts.productId, products.id))
        .where(eq(planProducts.planId, subscription.planId))

      return { planId: subscription.planId, products: rows.map((r) => r.key) }
    },
  }
}
