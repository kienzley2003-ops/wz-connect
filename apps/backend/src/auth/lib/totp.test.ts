import { describe, it, expect } from 'vitest'
import { generateTotpSecret, totp, verifyTotp, buildOtpauthUrl } from './totp.js'

describe('generateTotpSecret', () => {
  it('gera um secret em base32 (apenas A-Z e 2-7)', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
  })

  it('gera secrets diferentes a cada chamada', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret())
  })
})

describe('totp', () => {
  it('é determinístico para o mesmo secret e o mesmo instante', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(totp(secret, now)).toBe(totp(secret, now))
  })

  it('produz um código de 6 dígitos', () => {
    const secret = generateTotpSecret()
    expect(totp(secret, Date.now())).toMatch(/^\d{6}$/)
  })

  it('muda de código entre janelas de 30s diferentes', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    expect(totp(secret, t0)).not.toBe(totp(secret, t0 + 30_000))
  })
})

describe('verifyTotp', () => {
  it('aceita o código gerado no instante exato', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true)
  })

  it('aceita o código da janela anterior (drift -1)', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    const codePrevious = totp(secret, t0 - 30_000)
    expect(verifyTotp(secret, codePrevious, t0)).toBe(true)
  })

  it('aceita o código da janela seguinte (drift +1)', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    const codeNext = totp(secret, t0 + 30_000)
    expect(verifyTotp(secret, codeNext, t0)).toBe(true)
  })

  it('rejeita um código fora da janela de tolerância (drift -2)', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    const codeTooOld = totp(secret, t0 - 60_000)
    expect(verifyTotp(secret, codeTooOld, t0)).toBe(false)
  })

  it('rejeita um código inválido', () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(secret, '000000', Date.now())).toBe(false)
  })
})

describe('buildOtpauthUrl', () => {
  it('monta a URL otpauth com issuer e email codificados', () => {
    const url = buildOtpauthUrl({ secret: 'ABCD1234', email: 'admin@acme.com', issuer: 'wz-connect' })
    expect(url).toBe(
      'otpauth://totp/wz-connect%3Aadmin%40acme.com?secret=ABCD1234&issuer=wz-connect&algorithm=SHA1&digits=6&period=30'
    )
  })
})
