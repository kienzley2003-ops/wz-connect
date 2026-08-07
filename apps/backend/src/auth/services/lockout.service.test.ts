import { describe, it, expect } from 'vitest'
import { isLocked, recordFailure, recordSuccess } from './lockout.service.js'

describe('isLocked', () => {
  it('retorna false quando lockedUntil é null', () => {
    expect(isLocked({ failedLoginCount: 0, lockedUntil: null })).toBe(false)
  })

  it('retorna true quando lockedUntil está no futuro', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const future = new Date('2026-01-01T00:10:00Z')
    expect(isLocked({ failedLoginCount: 5, lockedUntil: future }, now)).toBe(true)
  })

  it('retorna false quando lockedUntil já passou', () => {
    const now = new Date('2026-01-01T00:31:00Z')
    const past = new Date('2026-01-01T00:00:00Z')
    expect(isLocked({ failedLoginCount: 5, lockedUntil: past }, now)).toBe(false)
  })
})

describe('recordFailure', () => {
  it('incrementa failedLoginCount sem travar antes de 5 tentativas', () => {
    const state = recordFailure({ failedLoginCount: 3, lockedUntil: null })
    expect(state.failedLoginCount).toBe(4)
    expect(state.lockedUntil).toBeNull()
  })

  it('trava por 30 minutos na 5ª tentativa falha', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const state = recordFailure({ failedLoginCount: 4, lockedUntil: null }, now)
    expect(state.failedLoginCount).toBe(5)
    expect(state.lockedUntil).toEqual(new Date('2026-01-01T00:30:00Z'))
  })

  it('mantém o bloqueio (não estende) em tentativas além da 5ª', () => {
    const now = new Date('2026-01-01T00:05:00Z')
    const lockedUntil = new Date('2026-01-01T00:30:00Z')
    const state = recordFailure({ failedLoginCount: 5, lockedUntil }, now)
    expect(state.failedLoginCount).toBe(6)
    expect(state.lockedUntil).toEqual(lockedUntil)
  })
})

describe('recordSuccess', () => {
  it('zera failedLoginCount e limpa lockedUntil', () => {
    expect(recordSuccess()).toEqual({ failedLoginCount: 0, lockedUntil: null })
  })
})
