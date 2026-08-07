import type { FastifyRequest } from 'fastify'
import { InsufficientRoleError } from '../../lib/errors.js'

export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const role = (request as FastifyRequest & { authUser?: { role: string } }).authUser?.role
    if (!role || !allowedRoles.includes(role)) {
      throw new InsufficientRoleError()
    }
  }
}
