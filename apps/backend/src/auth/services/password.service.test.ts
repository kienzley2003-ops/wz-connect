import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.service.js'

describe('hashPassword', () => {
  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const a = await hashPassword('senha-forte-123')
    const b = await hashPassword('senha-forte-123')
    expect(a).not.toBe(b)
  })

  it('gera um hash no formato bcrypt ($2a$/$2b$)', async () => {
    const hash = await hashPassword('senha-forte-123')
    expect(hash).toMatch(/^\$2[aby]\$/)
  })
})

describe('verifyPassword', () => {
  it('aceita a senha correta contra seu próprio hash', async () => {
    const hash = await hashPassword('senha-forte-123')
    expect(await verifyPassword('senha-forte-123', hash)).toBe(true)
  })

  it('rejeita uma senha errada', async () => {
    const hash = await hashPassword('senha-forte-123')
    expect(await verifyPassword('senha-errada', hash)).toBe(false)
  })
})
