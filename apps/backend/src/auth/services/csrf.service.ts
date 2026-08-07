import { randomBytes } from 'node:crypto'
import { safeEqual } from '../lib/safe-compare.js'

export function issueCsrfToken(): string {
  return randomBytes(24).toString('base64url')
}

export function verifyCsrfToken(headerToken: string | undefined, cookieToken: string | undefined): boolean {
  if (!headerToken || !cookieToken) {
    return false
  }
  return safeEqual(headerToken, cookieToken)
}
