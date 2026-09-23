import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { createEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listOrganizations, getOrganizationById } from './service.js'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function registerOrganizationsRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, createEntitlementsResolver(db))
  const requireSuperAdmin = requireRole('super_admin')

  app.get('/api/v1/organizations', { preHandler: [requireAuth, requireSuperAdmin] }, async () => {
    return listOrganizations(db)
  })

  app.get<{ Params: { id: string } }>(
    '/api/v1/organizations/:id',
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const parsed = ParamsSchema.safeParse(request.params)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      return getOrganizationById(db, parsed.data.id)
    }
  )
}
