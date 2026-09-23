import type { FastifyInstance } from 'fastify'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { createEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { getCurrentSubscription } from './service.js'
import { NotAMemberError } from '../lib/errors.js'

export async function registerBillingRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, createEntitlementsResolver(db))

  app.get('/api/v1/billing/subscription', { preHandler: requireAuth }, async (request) => {
    if (!request.tenant) {
      throw new NotAMemberError()
    }
    return getCurrentSubscription(db, request.tenant.id)
  })
}
