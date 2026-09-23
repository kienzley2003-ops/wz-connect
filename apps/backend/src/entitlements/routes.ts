import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { createEntitlementsResolver } from '../auth/services/entitlements.service.js'

const GetQuery = z.object({ organizationId: z.string().uuid() })
const CheckQuery = z.object({ organizationId: z.string().uuid(), product: z.string().min(1) })

/**
 * Consumido pelo @wz/connect-sdk (connect.entitlements.*, ver ADR 0005) —
 * é assim que os outros produtos do hub confirmam acesso a um produto sem
 * depender só do claim `products[]`, já embutido no token no login e que
 * só se atualiza no próximo refresh.
 */
export async function registerEntitlementsRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, createEntitlementsResolver(db))
  const resolver = createEntitlementsResolver(db)

  app.get('/api/v1/entitlements', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = GetQuery.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    return resolver.getActiveEntitlements(parsed.data.organizationId)
  })

  app.get('/api/v1/entitlements/check', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = CheckQuery.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    const { products } = await resolver.getActiveEntitlements(parsed.data.organizationId)
    return { allowed: products.includes(parsed.data.product) }
  })
}
