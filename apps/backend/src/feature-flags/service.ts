import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { featureFlags } from '../db/schema.js'

export interface FeatureFlagRow {
  id: string
  organizationId: string
  key: string
  enabled: boolean
  createdAt: Date
}

export async function listFeatureFlags(db: Db, organizationId: string): Promise<FeatureFlagRow[]> {
  return db.select().from(featureFlags).where(eq(featureFlags.organizationId, organizationId))
}

/** Upsert por (organizationId, key) — cria o flag na primeira vez que é
 * ligado/desligado para uma org, atualiza depois disso. */
export async function setFeatureFlag(
  db: Db,
  organizationId: string,
  key: string,
  enabled: boolean
): Promise<FeatureFlagRow> {
  const [row] = await db
    .insert(featureFlags)
    .values({ organizationId, key, enabled })
    .onConflictDoUpdate({
      target: [featureFlags.organizationId, featureFlags.key],
      set: { enabled },
    })
    .returning()
  return row
}

export async function getFeatureFlag(db: Db, organizationId: string, key: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(and(eq(featureFlags.organizationId, organizationId), eq(featureFlags.key, key)))
    .limit(1)
  return row?.enabled ?? false
}
