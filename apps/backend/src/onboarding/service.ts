import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { hashPassword } from '../auth/services/password.service.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { issueCsrfToken } from '../auth/services/csrf.service.js'
import type { createTokenService } from '../auth/services/token.service.js'
import { SlugTakenError } from '../lib/errors.js'

export interface OnboardOrganizationInput {
  name: string
  slug: string
  cnpj?: string
  billingEmail: string
  admin: { email: string; password: string }
}

export async function onboardOrganization(
  db: Db,
  tokenService: ReturnType<typeof createTokenService>,
  input: OnboardOrganizationInput
): Promise<{ organizationId: string; userId: string; access: string; refresh: string; csrf: string }> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.slug))
    .limit(1)
  if (existing) {
    throw new SlugTakenError()
  }

  const passwordHash = await hashPassword(input.admin.password)

  const { organizationId, userId } = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        name: input.name,
        slug: input.slug,
        cnpj: input.cnpj,
        billingEmail: input.billingEmail,
      })
      .returning({ id: organizations.id })
    const [user] = await tx
      .insert(users)
      .values({ email: input.admin.email, passwordHash })
      .returning({ id: users.id })
    await tx
      .insert(memberships)
      .values({ userId: user.id, organizationId: org.id, role: 'owner', status: 'active' })
    return { organizationId: org.id, userId: user.id }
  })

  const { sessionId, refreshToken } = await createOrRotateSession(db, userId, organizationId)
  const access = await tokenService.signAccess({
    sub: userId,
    org: organizationId,
    role: 'owner',
    session: sessionId,
  })

  return { organizationId, userId, access, refresh: refreshToken, csrf: issueCsrfToken() }
}
