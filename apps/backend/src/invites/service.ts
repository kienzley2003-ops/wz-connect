import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { invites, memberships, users, organizations } from '../db/schema.js'
import { generateRefreshToken } from '../auth/lib/refresh-token.js'
import { hashPassword } from '../auth/services/password.service.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { issueCsrfToken } from '../auth/services/csrf.service.js'
import type { createTokenService } from '../auth/services/token.service.js'
import { AppError, InviteInvalidError, InviteEmailMismatchError } from '../lib/errors.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function createInvite(
  db: Db,
  organizationId: string,
  email: string,
  role: string
): Promise<{ token: string }> {
  const token = generateRefreshToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

  await db.transaction(async (tx) => {
    await tx.insert(invites).values({ organizationId, email, role, token, expiresAt })

    const [existingUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existingUser) {
      await tx.insert(memberships).values({
        userId: existingUser.id,
        organizationId,
        role,
        status: 'invited',
      })
    }
  })

  return { token }
}

export async function previewInvite(
  db: Db,
  token: string
): Promise<{ organizationName: string; role: string; expired: boolean }> {
  const [row] = await db
    .select({
      organizationName: organizations.name,
      role: invites.role,
      expired: sql<boolean>`${invites.expiresAt} < now()`,
    })
    .from(invites)
    .innerJoin(organizations, eq(invites.organizationId, organizations.id))
    .where(eq(invites.token, token))
    .limit(1)
  if (!row) {
    throw new InviteInvalidError()
  }
  return row
}

export interface AcceptInviteInput {
  authedUserEmail?: string
  password?: string
}

export async function acceptInvite(
  db: Db,
  tokenService: ReturnType<typeof createTokenService>,
  token: string,
  input: AcceptInviteInput
): Promise<{
  organizationId: string
  userId: string
  role: string
  access: string
  refresh: string
  csrf: string
}> {
  const [invite] = await db
    .select({
      id: invites.id,
      organizationId: invites.organizationId,
      email: invites.email,
      role: invites.role,
      expired: sql<boolean>`${invites.expiresAt} < now()`,
    })
    .from(invites)
    .where(eq(invites.token, token))
    .limit(1)

  if (!invite || invite.expired) {
    throw new InviteInvalidError()
  }

  const [existingUser] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1)

  let userId: string
  if (existingUser) {
    if (!input.authedUserEmail || input.authedUserEmail !== invite.email) {
      throw new InviteEmailMismatchError()
    }
    userId = existingUser.id
    await db.transaction(async (tx) => {
      await tx
        .update(memberships)
        .set({ status: 'active' })
        .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, invite.organizationId)))
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id))
    })
  } else {
    if (!input.password) {
      throw new AppError('password-required', 400, 'Senha é obrigatória para aceitar este convite')
    }
    const passwordHash = await hashPassword(input.password)
    userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: invite.email, passwordHash })
        .returning({ id: users.id })
      await tx.insert(memberships).values({
        userId: user.id,
        organizationId: invite.organizationId,
        role: invite.role,
        status: 'active',
      })
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id))
      return user.id
    })
  }

  const { sessionId, refreshToken } = await createOrRotateSession(db, userId, invite.organizationId)
  const access = await tokenService.signAccess({
    sub: userId,
    org: invite.organizationId,
    role: invite.role,
    session: sessionId,
  })

  return {
    organizationId: invite.organizationId,
    userId,
    role: invite.role,
    access,
    refresh: refreshToken,
    csrf: issueCsrfToken(),
  }
}
