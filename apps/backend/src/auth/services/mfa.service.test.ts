import { describe, it, expect } from 'vitest'
import { encryptMfaSecret, decryptMfaSecret, setupMfa, verifyMfaCode } from './mfa.service.js'
import { totp } from '../lib/totp.js'

const JWT_SECRET = 'segredo-de-teste-com-32-caracteres-no-minimo'
const USER_ID = '11111111-1111-1111-1111-111111111111'

describe('encryptMfaSecret / decryptMfaSecret', () => {
  it('descriptografa de volta para o secret original', () => {
    const encrypted = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    expect(decryptMfaSecret(encrypted, JWT_SECRET, USER_ID)).toBe('SECRETOTOTP')
  })

  it('produz payloads diferentes a cada chamada (IV aleatório)', () => {
    const a = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    const b = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    expect(a).not.toBe(b)
  })

  it('falha ao descriptografar com um userId diferente (chave errada)', () => {
    const encrypted = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    expect(() =>
      decryptMfaSecret(encrypted, JWT_SECRET, '22222222-2222-2222-2222-222222222222')
    ).toThrow()
  })
})

describe('setupMfa', () => {
  it('retorna um secret base32 e uma otpauthUrl com o email', () => {
    const { secret, otpauthUrl } = setupMfa('admin@acme.com')
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    expect(otpauthUrl).toContain(encodeURIComponent('admin@acme.com'))
  })
})

describe('verifyMfaCode', () => {
  it('aceita o código TOTP atual do secret', () => {
    const { secret } = setupMfa('admin@acme.com')
    expect(verifyMfaCode(secret, totp(secret))).toBe(true)
  })

  it('rejeita um código incorreto', () => {
    const { secret } = setupMfa('admin@acme.com')
    expect(verifyMfaCode(secret, '000000')).toBe(false)
  })
})
