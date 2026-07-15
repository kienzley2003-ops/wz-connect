import { describe, it, expect } from 'vitest';
import { diffModules, UnknownModuleError } from './module-diff.js';

const catalogo = ['masterfila', 'agenda'];

describe('diffModules', () => {
  it('habilita o que falta', () => {
    expect(diffModules({ current: [], desired: ['masterfila'], catalog: catalogo })).toEqual({
      toEnable: ['masterfila'],
      toDisable: [],
    });
  });

  it('desabilita o que sobra', () => {
    expect(diffModules({ current: ['masterfila'], desired: [], catalog: catalogo })).toEqual({
      toEnable: [],
      toDisable: ['masterfila'],
    });
  });

  it('não mexe no que já está correto (operação vira no-op)', () => {
    expect(
      diffModules({ current: ['masterfila'], desired: ['masterfila'], catalog: catalogo }),
    ).toEqual({ toEnable: [], toDisable: [] });
  });

  it('habilita e desabilita na mesma operação', () => {
    expect(
      diffModules({ current: ['masterfila'], desired: ['agenda'], catalog: catalogo }),
    ).toEqual({ toEnable: ['agenda'], toDisable: ['masterfila'] });
  });

  it('ignora duplicatas no desejado', () => {
    expect(diffModules({ current: [], desired: ['agenda', 'agenda'], catalog: catalogo })).toEqual({
      toEnable: ['agenda'],
      toDisable: [],
    });
  });

  it('rejeita módulo fora do catálogo em vez de habilitar lixo', () => {
    expect(() => diffModules({ current: [], desired: ['fantasma'], catalog: catalogo })).toThrow(
      UnknownModuleError,
    );
  });

  it('permite desabilitar módulo que saiu do catálogo (limpeza de legado)', () => {
    // 'legado' não está mais no catálogo, mas segue habilitado no tenant:
    // precisa ser possível remover.
    expect(
      diffModules({
        current: ['legado', 'masterfila'],
        desired: ['masterfila'],
        catalog: catalogo,
      }),
    ).toEqual({ toEnable: [], toDisable: ['legado'] });
  });
});
