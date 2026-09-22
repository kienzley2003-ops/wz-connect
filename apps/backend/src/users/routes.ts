import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listUsers, setSuperAdmin } from './service.js'
import { logAuditEvent } from '../audit/service.js'

const ParamsSchema = z.object({ id: z.string().uuid() })
const SetSuperAdminBody = z.object({ isSuperAdmin: z.boolean() })

export async function registerUsersRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)
  const requireSuperAdmin = requireRole('super_admin')

  app.get('/api/v1/users', { preHandler: [requireAuth, requireSuperAdmin] }, async () => {
    return listUsers(db)
  })

  app.put<{ Params: { id: string } }>(
    '/api/v1/users/:id/super-admin',
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = ParamsSchema.safeParse(request.params)
      const body = SetSuperAdminBody.safeParse(request.body)
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const updated = await setSuperAdmin(db, params.data.id, body.data.isSuperAdmin)
      await logAuditEvent(db, {
        organizationId: null,
        actorId: request.authUser.sub,
        impersonatedBy: request.authUser.impersonatedBy,
        product: 'connect',
        action: body.data.isSuperAdmin ? 'user.super_admin.grant' : 'user.super_admin.revoke',
        target: params.data.id,
      })
      return reply.send(updated)
    }
  )
}
