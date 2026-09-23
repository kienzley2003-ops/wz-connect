import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { createEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listProducts, createProduct, updateProduct } from './service.js'

const CreateProductBody = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
})

const UpdateProductBody = z
  .object({ name: z.string().min(1).optional(), description: z.string().optional(), active: z.boolean().optional() })
  .refine((data) => data.name !== undefined || data.description !== undefined || data.active !== undefined, {
    message: 'Informe ao menos um campo',
  })

export async function registerProductsRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, createEntitlementsResolver(db))
  const requireSuperAdmin = requireRole('super_admin')

  app.get('/api/v1/products', { preHandler: requireAuth }, async () => {
    return listProducts(db)
  })

  app.post(
    '/api/v1/products',
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const parsed = CreateProductBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const product = await createProduct(db, parsed.data)
      return reply.status(201).send(product)
    }
  )

  app.put<{ Params: { id: string } }>(
    '/api/v1/products/:id',
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const parsed = UpdateProductBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const product = await updateProduct(db, request.params.id, parsed.data)
      return reply.send(product)
    }
  )
}
