import { randomBytes, createHash } from 'node:crypto'
import { safeEqual } from './safe-compare.js'

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyRefreshToken(token: string, hash: string): boolean {
  return safeEqual(hashRefreshToken(token), hash)
}
