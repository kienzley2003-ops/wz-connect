import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { logAuditEvent, listAuditEvents } from './service.js'
import { NotAMemberError } from '../lib/errors.js'

const ProductEnum = z.enum(['connect', 'masterfila', 'desk', 'orc', 'agente'])

const LogEventBody = z.object({
  product: ProductEnum,
  action: z.string().min(1),
  target: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  organizationId: z.string().uuid().optional(),
})

const ListEventsQuery = z.object({
  organizationId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  product: ProductEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export async function registerAuditRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)
  const requireHubOrOrgAdmin = requireRole('super_admin', 'owner', 'admin')

  app.post('/api/v1/audit', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = LogEventBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    const organizationId = parsed.data.organizationId ?? request.tenant?.id ?? request.authUser.org ?? null
    const event = await logAuditEvent(db, {
      organizationId,
      actorId: request.authUser.sub,
      impersonatedBy: request.authUser.impersonatedBy,
      product: parsed.data.product,
      action: parsed.data.action,
      target: parsed.data.target,
      metadata: parsed.data.metadata,
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    })
    return reply.status(201).send(event)
  })

  app.get(
    '/api/v1/audit-events',
    { preHandler: [requireAuth, requireHubOrOrgAdmin] },
    async (request, reply) => {
      const parsed = ListEventsQuery.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }

      const isSuperAdmin = request.authUser.role === 'super_admin'
      let organizationId = parsed.data.organizationId
      if (!isSuperAdmin) {
        if (!request.tenant) {
          throw new NotAMemberError()
        }
        organizationId = request.tenant.id
      }

      const events = await listAuditEvents(db, {
        organizationId,
        actorId: parsed.data.actorId,
        product: parsed.data.product,
        from: parsed.data.from,
        to: parsed.data.to,
      })
      return reply.send(events)
    }
  )
}
