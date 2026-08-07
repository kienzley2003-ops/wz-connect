import type { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { env } from '../env.js'

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  await app.register(cookie)
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  })
}
