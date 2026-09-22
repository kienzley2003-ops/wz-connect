import type { FastifyReply } from 'fastify'
import { env } from '../../env.js'

/**
 * `domain: env.BASE_DOMAIN` é o que faz o cookie valer tanto no domínio apex
 * (`localhost`, usado por onboarding e login de super_admin) quanto em
 * qualquer subdomínio de organização (`acme.localhost`) — sem isso, um
 * cookie setado no apex é host-only e não acompanha a navegação para o
 * subdomínio da org (ver ADR 0003, resolução de tenancy por subdomínio).
 */
export function setAuthCookies(
  reply: FastifyReply,
  tokens: { access: string; refresh: string; csrf: string }
): void {
  reply.setCookie('access_token', tokens.access, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    domain: env.BASE_DOMAIN,
  })
  reply.setCookie('refresh_token', tokens.refresh, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    domain: env.BASE_DOMAIN,
  })
  reply.setCookie('csrf', tokens.csrf, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    domain: env.BASE_DOMAIN,
  })
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('access_token', { path: '/', domain: env.BASE_DOMAIN })
  reply.clearCookie('refresh_token', { path: '/', domain: env.BASE_DOMAIN })
  reply.clearCookie('csrf', { path: '/', domain: env.BASE_DOMAIN })
}
