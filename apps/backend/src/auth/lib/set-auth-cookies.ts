import type { FastifyReply } from 'fastify'

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { access: string; refresh: string; csrf: string }
): void {
  reply.setCookie('access_token', tokens.access, { httpOnly: true, sameSite: 'lax', path: '/' })
  reply.setCookie('refresh_token', tokens.refresh, { httpOnly: true, sameSite: 'lax', path: '/' })
  reply.setCookie('csrf', tokens.csrf, { httpOnly: false, sameSite: 'lax', path: '/' })
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('access_token', { path: '/' })
  reply.clearCookie('refresh_token', { path: '/' })
  reply.clearCookie('csrf', { path: '/' })
}
