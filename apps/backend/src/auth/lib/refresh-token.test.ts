import { describe, it, expect } from 'vitest'
import { generateRefreshToken, hashRefreshToken, verifyRefreshToken } from './refresh-token.js'

describe('generateRefreshToken', () => {
  it('gera uma string base64url de 32 bytes de entropia (43 chars, sem padding)', () => {
    const token = generateRefreshToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('gera tokens diferentes a cada chamada', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken())
  })
})

describe('hashRefreshToken', () => {
  it('é determinístico para o mesmo input', () => {
    const token = generateRefreshToken()
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
  })

  it('produz um hex de 64 caracteres (SHA-256)', () => {
    expect(hashRefreshToken('qualquer-coisa')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produz hashes diferentes para inputs diferentes', () => {
    expect(hashRefreshToken('a')).not.toBe(hashRefreshToken('b'))
  })
})

describe('verifyRefreshToken', () => {
  it('retorna true quando o token corresponde ao hash', () => {
    const token = generateRefreshToken()
    const hash = hashRefreshToken(token)
    expect(verifyRefreshToken(token, hash)).toBe(true)
  })

  it('retorna false quando o token não corresponde ao hash', () => {
    const hash = hashRefreshToken(generateRefreshToken())
    expect(verifyRefreshToken('token-errado', hash)).toBe(false)
  })
})
