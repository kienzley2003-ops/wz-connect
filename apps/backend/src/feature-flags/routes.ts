import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { createEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listFeatureFlags, setFeatureFlag } from './service.js'

const ListQuery = z.object({ organizationId: z.string().uuid() })
const SetBody = z.object({
  organizationId: z.string().uuid(),
  key: z.string().min(1).max(128),
  enabled: z.boolean(),
})

export async function registerFeatureFlagsRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, createEntitlementsResolver(db))
  const requireSuperAdmin = requireRole('super_admin')

  app.get(
    '/api/v1/feature-flags',
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const parsed = ListQuery.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      return listFeatureFlags(db, parsed.data.organizationId)
    }
  )

  app.put(
    '/api/v1/feature-flags',
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const parsed = SetBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const flag = await setFeatureFlag(db, parsed.data.organizationId, parsed.data.key, parsed.data.enabled)
      return reply.send(flag)
    }
  )
}
