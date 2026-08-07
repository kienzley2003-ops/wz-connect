import { describe, it, expect, vi } from 'vitest'
import { createOrgResolver, type OrgLookup } from './resolver.js'

function makeLookup(result: { id: string; slug: string } | null) {
  const state = { calls: 0 }
  const lookup: OrgLookup = {
    async findBySlug() {
      state.calls++
      return result
    },
  }
  return { lookup, state }
}

describe('resolveOrgFromHost', () => {
  it('extrai o subdomínio do host e resolve via lookup', async () => {
    const { lookup } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup)
    expect(await resolver.resolveOrgFromHost('acme.wz-hub.com')).toEqual({ id: 'org-1', slug: 'acme' })
  })

  it('ignora a porta ao extrair o subdomínio', async () => {
    const { lookup } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup)
    expect(await resolver.resolveOrgFromHost('acme.localhost:3000')).toEqual({ id: 'org-1', slug: 'acme' })
  })

  it('usa cache em chamadas repetidas dentro do TTL (não chama o lookup de novo)', async () => {
    const { lookup, state } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup, 60_000)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    expect(state.calls).toBe(1)
  })

  it('busca de novo após o TTL expirar', async () => {
    vi.useFakeTimers()
    const { lookup, state } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup, 1_000)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    vi.advanceTimersByTime(1_001)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    expect(state.calls).toBe(2)
    vi.useRealTimers()
  })

  it('retorna null quando o slug não existe (sem lançar)', async () => {
    const { lookup } = makeLookup(null)
    const resolver = createOrgResolver(lookup)
    expect(await resolver.resolveOrgFromHost('naoexiste.wz-hub.com')).toBeNull()
  })

  it('invalidate() força nova busca no lookup', async () => {
    const { lookup, state } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    resolver.invalidate('acme')
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    expect(state.calls).toBe(2)
  })
})
