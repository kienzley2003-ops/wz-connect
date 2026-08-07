import { createHmac, randomBytes } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20))
}

function encodeBase32(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: string, counter: number): string {
  const key = decodeBase32(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

export function totp(secret: string, timestampMs: number = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds)
  return hotp(secret, counter)
}

export function verifyTotp(
  secret: string,
  code: string,
  timestampMs: number = Date.now(),
  stepSeconds = 30
): boolean {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds)
  for (const drift of [-1, 0, 1]) {
    if (hotp(secret, counter + drift) === code) {
      return true
    }
  }
  return false
}

export function buildOtpauthUrl(params: { secret: string; email: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.email}`)
  const issuer = encodeURIComponent(params.issuer)
  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}
