import { describe, it, expect } from 'vitest'
import { stubEntitlementsResolver } from './entitlements.service.js'

describe('stubEntitlementsResolver', () => {
  it('retorna planId null e products vazio para qualquer organizationId', async () => {
    const result = await stubEntitlementsResolver.getActiveEntitlements('qualquer-org-id')
    expect(result).toEqual({ planId: null, products: [] })
  })
})
