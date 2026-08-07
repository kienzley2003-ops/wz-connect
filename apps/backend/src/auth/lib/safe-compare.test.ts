import { describe, it, expect } from 'vitest'
import { safeEqual } from './safe-compare.js'

describe('safeEqual', () => {
  it('retorna true para strings idênticas', () => {
    expect(safeEqual('segredo123', 'segredo123')).toBe(true)
  })

  it('retorna false para strings diferentes do mesmo tamanho', () => {
    expect(safeEqual('segredo123', 'segredo456')).toBe(false)
  })

  it('retorna false para strings de tamanhos diferentes', () => {
    expect(safeEqual('curto', 'muito-mais-longo')).toBe(false)
  })

  it('retorna false para string vazia comparada com não-vazia', () => {
    expect(safeEqual('', 'algo')).toBe(false)
  })

  it('retorna true para duas strings vazias', () => {
    expect(safeEqual('', '')).toBe(true)
  })
})
