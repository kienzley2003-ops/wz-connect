import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { createTokenService } from '../auth/services/token.service.js'
import { createEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { setAuthCookies } from '../auth/lib/set-auth-cookies.js'
import { impersonateOrganization } from './service.js'
import { ImpersonationForbiddenError } from '../lib/errors.js'

const ParamsSchema = z.object({ organizationId: z.string().uuid() })

export async function registerImpersonationRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, createEntitlementsResolver(db))
  const tokenService = createTokenService(app.jwt, createEntitlementsResolver(db))

  app.post<{ Params: { organizationId: string } }>(
    '/api/v1/impersonate/:organizationId',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (request.authUser.role !== 'super_admin') {
        throw new ImpersonationForbiddenError()
      }
      const parsed = ParamsSchema.safeParse(request.params)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const tokens = await impersonateOrganization(
        db,
        tokenService,
        request.authUser.sub,
        parsed.data.organizationId
      )
      setAuthCookies(reply, tokens)
      return reply.send({ organizationId: parsed.data.organizationId, impersonating: true })
    }
  )
}
