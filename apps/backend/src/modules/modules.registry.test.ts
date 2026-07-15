import { describe, it, expect } from 'vitest';
import { ModulesRegistry } from './modules.registry.js';
import type { WzModule } from './module.contract.js';

function mod(key: string): WzModule {
  return { key, nome: key.toUpperCase(), plugin: async () => {} };
}

describe('ModulesRegistry', () => {
  it('registra e recupera um módulo pela chave', () => {
    const reg = new ModulesRegistry();
    const m = mod('masterfila');
    reg.register(m);

    expect(reg.get('masterfila')).toBe(m);
    expect(reg.has('masterfila')).toBe(true);
    expect(reg.keys()).toEqual(['masterfila']);
  });

  it('retorna undefined para módulo não registrado', () => {
    const reg = new ModulesRegistry();
    expect(reg.get('agenda')).toBeUndefined();
    expect(reg.has('agenda')).toBe(false);
  });

  it('rejeita registro duplicado da mesma chave', () => {
    const reg = new ModulesRegistry();
    reg.register(mod('masterfila'));
    expect(() => reg.register(mod('masterfila'))).toThrow(/masterfila/);
  });

  it('lista os módulos na ordem de registro', () => {
    const reg = new ModulesRegistry();
    reg.register(mod('masterfila'));
    reg.register(mod('agenda'));
    expect(reg.list().map((m) => m.key)).toEqual(['masterfila', 'agenda']);
  });

  it('enabledFor devolve só os módulos carregados e habilitados no tenant', () => {
    const reg = new ModulesRegistry();
    reg.register(mod('masterfila'));
    reg.register(mod('agenda'));

    expect(reg.enabledFor(['masterfila']).map((m) => m.key)).toEqual(['masterfila']);
  });

  it('enabledFor ignora chaves habilitadas que não têm módulo carregado', () => {
    const reg = new ModulesRegistry();
    reg.register(mod('masterfila'));

    expect(reg.enabledFor(['masterfila', 'fantasma']).map((m) => m.key)).toEqual(['masterfila']);
  });

  it('missing detecta drift: habilitado no CORE mas não carregado', () => {
    const reg = new ModulesRegistry();
    reg.register(mod('masterfila'));

    expect(reg.missing(['masterfila', 'fantasma'])).toEqual(['fantasma']);
  });

  it('missing é vazio quando tudo que está habilitado foi carregado', () => {
    const reg = new ModulesRegistry();
    reg.register(mod('masterfila'));
    expect(reg.missing(['masterfila'])).toEqual([]);
  });
});
