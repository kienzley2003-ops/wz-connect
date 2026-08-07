import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users, memberships } from '../../db/schema.js'
import { createOrRotateSession } from './session.service.js'
import type { createTokenService } from './token.service.js'
import { issueCsrfToken } from './csrf.service.js'
import { NotAMemberError } from '../../lib/errors.js'

export async function resolveRole(
  db: Db,
  userId: string,
  organizationId: string | null
): Promise<string> {
  if (organizationId === null) {
    const [user] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user?.isSuperAdmin) {
      throw new NotAMemberError()
    }
    return 'super_admin'
  }

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1)
  if (!membership) {
    throw new NotAMemberError()
  }
  return membership.role
}

export async function completeLogin(
  db: Db,
  tokenService: ReturnType<typeof createTokenService>,
  userId: string,
  organizationId: string | null,
  role: string
): Promise<{ access: string; refresh: string; csrf: string }> {
  const { sessionId, refreshToken } = await createOrRotateSession(db, userId, organizationId)
  const access = await tokenService.signAccess({ sub: userId, org: organizationId, role, session: sessionId })
  return { access, refresh: refreshToken, csrf: issueCsrfToken() }
}
