import { describe, it, expect } from 'vitest';
import { hasModule, requireModule, tenantOf } from './modules.js';
import { ModuleNotEnabledError, type ConnectClaims } from './types.js';

const claims = (over: Partial<ConnectClaims> = {}): ConnectClaims => ({
  sub: 'u1',
  sid: 's1',
  tnt: 'acme',
  mods: ['masterfila'],
  ...over,
});

describe('hasModule', () => {
  it('reconhece módulo habilitado', () => {
    expect(hasModule(claims(), 'masterfila')).toBe(true);
  });

  it('nega módulo não habilitado', () => {
    expect(hasModule(claims(), 'agenda')).toBe(false);
  });

  it('nega quando o token não traz mods (token de plataforma)', () => {
    expect(hasModule(claims({ mods: undefined }), 'masterfila')).toBe(false);
  });
});

describe('requireModule', () => {
  it('passa para módulo habilitado', () => {
    expect(() => requireModule(claims(), 'masterfila')).not.toThrow();
  });

  it('lança ModuleNotEnabledError para módulo não habilitado', () => {
    expect(() => requireModule(claims(), 'agenda')).toThrow(ModuleNotEnabledError);
  });
});

describe('tenantOf', () => {
  it('retorna o subdomínio do tenant', () => {
    expect(tenantOf(claims())).toBe('acme');
  });

  it('retorna null em token de plataforma', () => {
    expect(tenantOf(claims({ tnt: undefined }))).toBeNull();
  });
});
