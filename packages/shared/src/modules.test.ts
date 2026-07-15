import { describe, it, expect } from 'vitest';
import { MODULE_CATALOG, findModule } from './modules.js';

describe('MODULE_CATALOG', () => {
  it('expõe chave, rótulo e caminho de cada módulo', () => {
    for (const entry of MODULE_CATALOG) {
      expect(entry.key).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.path.startsWith('/')).toBe(true);
    }
  });

  it('não tem chaves duplicadas', () => {
    const keys = MODULE_CATALOG.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('findModule', () => {
  it('encontra um módulo do catálogo pela chave', () => {
    expect(findModule('masterfila')).toEqual({
      key: 'masterfila',
      label: 'MasterFila',
      path: '/masterfila',
    });
  });

  it('retorna undefined para chave desconhecida', () => {
    expect(findModule('fantasma')).toBeUndefined();
  });
});
