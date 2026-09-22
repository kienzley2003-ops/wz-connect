import { describe, it, expect, vi } from 'vitest'
import type { FastifyReply } from 'fastify'
import { setAuthCookies, clearAuthCookies } from './set-auth-cookies.js'
import { env } from '../../env.js'

function makeReply() {
  return { setCookie: vi.fn(), clearCookie: vi.fn() } as unknown as FastifyReply
}

describe('setAuthCookies', () => {
  it('seta access_token e refresh_token como httpOnly, e csrf como não-httpOnly', () => {
    const reply = makeReply()
    setAuthCookies(reply, { access: 'a', refresh: 'r', csrf: 'c' })
    expect(reply.setCookie).toHaveBeenCalledWith('access_token', 'a', expect.objectContaining({ httpOnly: true }))
    expect(reply.setCookie).toHaveBeenCalledWith('refresh_token', 'r', expect.objectContaining({ httpOnly: true }))
    expect(reply.setCookie).toHaveBeenCalledWith('csrf', 'c', expect.objectContaining({ httpOnly: false }))
  })

  it('seta os três cookies com domain = BASE_DOMAIN, para valer em qualquer subdomínio de org', () => {
    const reply = makeReply()
    setAuthCookies(reply, { access: 'a', refresh: 'r', csrf: 'c' })
    expect(reply.setCookie).toHaveBeenCalledWith('access_token', 'a', expect.objectContaining({ domain: env.BASE_DOMAIN }))
    expect(reply.setCookie).toHaveBeenCalledWith('refresh_token', 'r', expect.objectContaining({ domain: env.BASE_DOMAIN }))
    expect(reply.setCookie).toHaveBeenCalledWith('csrf', 'c', expect.objectContaining({ domain: env.BASE_DOMAIN }))
  })
})

describe('clearAuthCookies', () => {
  it('limpa os três cookies', () => {
    const reply = makeReply()
    clearAuthCookies(reply)
    expect(reply.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object))
    expect(reply.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object))
    expect(reply.clearCookie).toHaveBeenCalledWith('csrf', expect.any(Object))
  })
})
