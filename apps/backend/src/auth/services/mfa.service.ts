import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { generateTotpSecret, verifyTotp, buildOtpauthUrl } from '../lib/totp.js'

function deriveKey(jwtSecret: string, userId: string): Buffer {
  return scryptSync(jwtSecret, userId, 32)
}

export function encryptMfaSecret(secret: string, jwtSecret: string, userId: string): string {
  const key = deriveKey(jwtSecret, userId)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url')
}

export function decryptMfaSecret(payload: string, jwtSecret: string, userId: string): string {
  const key = deriveKey(jwtSecret, userId)
  const raw = Buffer.from(payload, 'base64url')
  const iv = raw.subarray(0, 12)
  const authTag = raw.subarray(12, 28)
  const encrypted = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function setupMfa(email: string, issuer = 'wz-connect'): { secret: string; otpauthUrl: string } {
  const secret = generateTotpSecret()
  return { secret, otpauthUrl: buildOtpauthUrl({ secret, email, issuer }) }
}

export function verifyMfaCode(secret: string, code: string): boolean {
  return verifyTotp(secret, code)
}
