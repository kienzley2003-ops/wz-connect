import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { memberships, membershipRoleEnum, membershipStatusEnum, users } from '../db/schema.js'
import { CrossOrgAccessError } from '../lib/errors.js'

export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number]
export type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number]

export interface MembershipRow {
  id: string
  userId: string
  organizationId: string
  role: string
  status: string
  createdAt: Date
}

export interface MembershipWithUserRow extends MembershipRow {
  email: string
}

export async function listMemberships(db: Db, organizationId: string): Promise<MembershipWithUserRow[]> {
  return db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      organizationId: memberships.organizationId,
      role: memberships.role,
      status: memberships.status,
      createdAt: memberships.createdAt,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, organizationId))
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

export interface UpdateMembershipInput {
  role?: MembershipRole
  status?: MembershipStatus
}

export async function updateMembership(
  db: Db,
  organizationId: string,
  membershipId: string,
  updates: UpdateMembershipInput
): Promise<MembershipRow> {
  const [existing] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1)
  if (!existing || existing.organizationId !== organizationId) {
    throw new CrossOrgAccessError()
  }
  const [updated] = await db
    .update(memberships)
    .set({
      ...(updates.role !== undefined ? { role: updates.role } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
    })
    .where(eq(memberships.id, membershipId))
    .returning()
  return updated
}
