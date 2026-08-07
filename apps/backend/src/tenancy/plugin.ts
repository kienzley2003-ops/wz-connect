import type { FastifyInstance } from 'fastify'
import type { Db } from '../db/client.js'
import { createOrgResolver } from './resolver.js'
import { createDbOrgLookup } from './db-lookup.js'
import { TenantNotFoundError } from '../lib/errors.js'
import { env } from '../env.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: { id: string; slug: string } | null
  }
}

export async function registerTenancyPlugin(
  app: FastifyInstance,
  db: Db,
  options: { publicPaths?: string[] } = {}
): Promise<void> {
  const publicPaths = new Set(options.publicPaths ?? [])
  const resolver = createOrgResolver(createDbOrgLookup(db))

  app.decorateRequest('tenant', null)

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof TenantNotFoundError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } })
    }
    throw err
  })

  app.addHook('preHandler', async (request) => {
    if (publicPaths.has(request.url.split('?')[0])) {
      request.tenant = null
      return
    }

    const host = (request.headers.host ?? '').split(':')[0]
    if (host === env.BASE_DOMAIN) {
      request.tenant = null
      return
    }

    const org = await resolver.resolveOrgFromHost(request.headers.host ?? '')
    if (!org) {
      throw new TenantNotFoundError(host)
    }
    request.tenant = org
  })
}
