import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { sessions } from '../db/schema.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listActiveSessions, revokeSession } from '../auth/services/session.service.js'
import { AppError } from '../lib/errors.js'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function registerSessionsRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)

  app.get('/api/v1/sessions', { preHandler: requireAuth }, async (request) => {
    return listActiveSessions(db, request.authUser.sub)
  })

  app.post<{ Params: { id: string } }>(
    '/api/v1/sessions/:id/revoke',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = ParamsSchema.safeParse(request.params)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const [session] = await db.select().from(sessions).where(eq(sessions.id, parsed.data.id)).limit(1)
      if (!session || session.userId !== request.authUser.sub) {
        throw new AppError('forbidden', 403, 'Não é possível revogar sessão de outro usuário')
      }
      await revokeSession(db, parsed.data.id)
      return reply.send({ ok: true })
    }
  )
}
