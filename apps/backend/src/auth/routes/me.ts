import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { createRequireAuth } from '../hooks/require-auth.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'

export async function registerMeRoute(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)

  app.get('/api/v1/auth/me', { preHandler: requireAuth }, async (request) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.authUser.sub)).limit(1)
    return {
      id: user.id,
      email: user.email,
      role: request.authUser.role,
      org: request.authUser.org ?? null,
      products: request.authUser.products,
    }
  })
}
