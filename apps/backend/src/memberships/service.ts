import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { memberships, membershipRoleEnum } from '../db/schema.js'
import { CrossOrgAccessError } from '../lib/errors.js'

export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number]

export interface MembershipRow {
  id: string
  userId: string
  organizationId: string
  role: string
  status: string
  createdAt: Date
}

export async function listMemberships(db: Db, organizationId: string): Promise<MembershipRow[]> {
  return db.select().from(memberships).where(eq(memberships.organizationId, organizationId))
}

export async function createMembership(
  db: Db,
  organizationId: string,
  userId: string,
  role: MembershipRole
): Promise<MembershipRow> {
  const [row] = await db
    .insert(memberships)
    .values({ organizationId, userId, role, status: 'active' })
    .returning()
  return row
}

export async function updateMembershipRole(
  db: Db,
  organizationId: string,
  membershipId: string,
  role: MembershipRole
): Promise<MembershipRow> {
  const [existing] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1)
  if (!existing || existing.organizationId !== organizationId) {
    throw new CrossOrgAccessError()
  }
  const [updated] = await db.update(memberships).set({ role }).where(eq(memberships.id, membershipId)).returning()
  return updated
}
