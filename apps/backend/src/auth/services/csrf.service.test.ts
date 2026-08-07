import { describe, it, expect } from 'vitest'
import { issueCsrfToken, verifyCsrfToken } from './csrf.service.js'

describe('issueCsrfToken', () => {
  it('gera um token base64url não vazio', () => {
    const token = issueCsrfToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThan(0)
  })

  it('gera tokens diferentes a cada chamada', () => {
    expect(issueCsrfToken()).not.toBe(issueCsrfToken())
  })
})

describe('verifyCsrfToken', () => {
  it('aceita quando header e cookie coincidem', () => {
    const token = issueCsrfToken()
    expect(verifyCsrfToken(token, token)).toBe(true)
  })

  it('rejeita quando header e cookie divergem', () => {
    expect(verifyCsrfToken(issueCsrfToken(), issueCsrfToken())).toBe(false)
  })

  it('rejeita quando o header está ausente', () => {
    expect(verifyCsrfToken(undefined, issueCsrfToken())).toBe(false)
  })

  it('rejeita quando o cookie está ausente', () => {
    expect(verifyCsrfToken(issueCsrfToken(), undefined)).toBe(false)
  })
})
