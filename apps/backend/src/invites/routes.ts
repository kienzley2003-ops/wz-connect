import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { users } from '../db/schema.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { setAuthCookies } from '../auth/lib/set-auth-cookies.js'
import { createInvite, previewInvite, acceptInvite } from './service.js'
import { NotAMemberError } from '../lib/errors.js'

const RoleEnum = z.enum(['owner', 'admin', 'manager', 'operator', 'viewer'])
const CreateInviteBody = z.object({ email: z.string().email(), role: RoleEnum })
const AcceptInviteBody = z.object({ password: z.string().min(8).optional() })

export async function registerInvitesRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)
  const requireOwnerOrAdmin = requireRole('owner', 'admin')
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post(
    '/api/v1/invites',
    { preHandler: [requireAuth, requireOwnerOrAdmin] },
    async (request, reply) => {
      if (!request.tenant) {
        throw new NotAMemberError()
      }
      const parsed = CreateInviteBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const { token } = await createInvite(db, request.tenant.id, parsed.data.email, parsed.data.role)
      return reply.status(201).send({ token })
    }
  )

  app.get<{ Params: { token: string } }>('/api/v1/invites/:token', async (request) => {
    return previewInvite(db, request.params.token)
  })

  app.post<{ Params: { token: string } }>('/api/v1/invites/:token/accept', async (request, reply) => {
    const parsed = AcceptInviteBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }

    let authedUserEmail: string | undefined
    const cookieToken = request.cookies.access_token
    if (cookieToken) {
      try {
        const payload = tokenService.verifyAccess(cookieToken)
        const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, payload.sub)).limit(1)
        authedUserEmail = user?.email
      } catch {
        // token ausente/expirado/inválido — tratado como aceite anônimo
      }
    }

    const result = await acceptInvite(db, tokenService, request.params.token, {
      authedUserEmail,
      password: parsed.data.password,
    })
    setAuthCookies(reply, { access: result.access, refresh: result.refresh, csrf: result.csrf })
    return reply.send({ organizationId: result.organizationId, userId: result.userId, role: result.role })
  })
}
