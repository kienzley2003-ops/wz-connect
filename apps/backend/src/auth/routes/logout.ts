import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { createRequireAuth } from '../hooks/require-auth.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { revokeSession } from '../services/session.service.js'
import { verifyCsrfToken } from '../services/csrf.service.js'
import { clearAuthCookies } from '../lib/set-auth-cookies.js'
import { logAuditEvent } from '../../audit/service.js'
import { CsrfMismatchError } from '../../lib/errors.js'

export async function registerLogoutRoute(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    if (!verifyCsrfToken(request.headers['x-csrf-token'] as string | undefined, request.cookies.csrf)) {
      throw new CsrfMismatchError()
    }
    await revokeSession(db, request.authUser.session)
    await logAuditEvent(db, {
      organizationId: request.authUser.org ?? null,
      actorId: request.authUser.sub,
      impersonatedBy: request.authUser.impersonatedBy,
      product: 'connect',
      action: 'auth.logout',
      ip: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    })
    clearAuthCookies(reply)
    return reply.send({ ok: true })
  })
}
