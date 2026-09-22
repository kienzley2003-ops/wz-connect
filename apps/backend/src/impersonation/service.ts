import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { organizations } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { issueCsrfToken } from '../auth/services/csrf.service.js'
import type { createTokenService } from '../auth/services/token.service.js'
import { logAuditEvent } from '../audit/service.js'
import { OrganizationNotFoundError } from '../lib/errors.js'

export async function impersonateOrganization(
  db: Db,
  tokenService: ReturnType<typeof createTokenService>,
  superAdminUserId: string,
  organizationId: string
): Promise<{ access: string; refresh: string; csrf: string }> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
  if (!org) {
    throw new OrganizationNotFoundError()
  }

  const { sessionId, refreshToken } = await createOrRotateSession(db, superAdminUserId, organizationId)
  const access = await tokenService.signAccess({
    sub: superAdminUserId,
    org: organizationId,
    role: 'admin',
    session: sessionId,
    impersonatedBy: superAdminUserId,
  })

  await logAuditEvent(db, {
    organizationId,
    actorId: superAdminUserId,
    impersonatedBy: superAdminUserId,
    product: 'connect',
    action: 'impersonation.start',
    target: organizationId,
  })

  return { access, refresh: refreshToken, csrf: issueCsrfToken() }
}
