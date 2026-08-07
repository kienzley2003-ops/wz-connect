import { describe, it, expect } from 'vitest'
import { requireRole } from './require-role.js'
import { InsufficientRoleError } from '../../lib/errors.js'
import type { FastifyRequest } from 'fastify'

function makeRequest(role: string): FastifyRequest {
  return { authUser: { role } } as unknown as FastifyRequest
}

describe('requireRole', () => {
  it('permite quando o role do usuário está na lista', async () => {
    const hook = requireRole('owner', 'admin')
    await expect(hook(makeRequest('admin'))).resolves.toBeUndefined()
  })

  it('rejeita com InsufficientRoleError 403 quando o role não está na lista', async () => {
    const hook = requireRole('owner', 'admin')
    await expect(hook(makeRequest('viewer'))).rejects.toThrow(InsufficientRoleError)
  })
})
