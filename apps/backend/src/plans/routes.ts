import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { createEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listPlans, getPlanById, createPlan, updatePlan } from './service.js'

const PlanProductSchema = z.object({
  productId: z.string().uuid(),
  limits: z.record(z.number()).optional(),
})

const BillingIntervalEnum = z.enum(['month', 'year'])

const CreatePlanBody = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  billingInterval: BillingIntervalEnum,
  products: z.array(PlanProductSchema).optional(),
})

const UpdatePlanBody = z
  .object({
    name: z.string().min(1).optional(),
    priceCents: z.number().int().nonnegative().optional(),
    billingInterval: BillingIntervalEnum.optional(),
    products: z.array(PlanProductSchema).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.priceCents !== undefined ||
      data.billingInterval !== undefined ||
      data.products !== undefined,
    { message: 'Informe ao menos um campo' }
  )

export async function registerPlansRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, createEntitlementsResolver(db))
  const requireSuperAdmin = requireRole('super_admin')

  app.get('/api/v1/plans', { preHandler: requireAuth }, async () => {
    return listPlans(db)
  })

  app.get<{ Params: { id: string } }>('/api/v1/plans/:id', { preHandler: requireAuth }, async (request) => {
    return getPlanById(db, request.params.id)
  })

  app.post('/api/v1/plans', { preHandler: [requireAuth, requireSuperAdmin] }, async (request, reply) => {
    const parsed = CreatePlanBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    const plan = await createPlan(db, parsed.data)
    return reply.status(201).send(plan)
  })

  app.put<{ Params: { id: string } }>(
    '/api/v1/plans/:id',
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const parsed = UpdatePlanBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const plan = await updatePlan(db, request.params.id, parsed.data)
      return reply.send(plan)
    }
  )
}
