import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listMemberships, createMembership, updateMembershipRole } from './service.js'
import { NotAMemberError } from '../lib/errors.js'

const RoleEnum = z.enum(['owner', 'admin', 'manager', 'operator', 'viewer'])
const CreateMembershipBody = z.object({ userId: z.string().uuid(), role: RoleEnum })
const UpdateMembershipBody = z.object({ role: RoleEnum })

export async function registerMembershipsRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)
  const requireOwnerOrAdmin = requireRole('owner', 'admin')

  app.get('/api/v1/memberships', { preHandler: requireAuth }, async (request) => {
    if (!request.tenant) {
      throw new NotAMemberError()
    }
    return listMemberships(db, request.tenant.id)
  })

  app.post(
    '/api/v1/memberships',
    { preHandler: [requireAuth, requireOwnerOrAdmin] },
    async (request, reply) => {
      if (!request.tenant) {
        throw new NotAMemberError()
      }
      const parsed = CreateMembershipBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const membership = await createMembership(db, request.tenant.id, parsed.data.userId, parsed.data.role)
      return reply.status(201).send(membership)
    }
  )

  app.put<{ Params: { id: string } }>(
    '/api/v1/memberships/:id',
    { preHandler: [requireAuth, requireOwnerOrAdmin] },
    async (request, reply) => {
      if (!request.tenant) {
        throw new NotAMemberError()
      }
      const parsed = UpdateMembershipBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const membership = await updateMembershipRole(db, request.tenant.id, request.params.id, parsed.data.role)
      return reply.send(membership)
    }
  )
}
