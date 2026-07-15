import { describe, it, expect } from 'vitest';
import { resolveEntitlements, checkEntitlement, type Entitlements } from './entitlements.js';

describe('resolveEntitlements', () => {
  it('combina módulos habilitados e limites do plano', () => {
    const ent = resolveEntitlements({
      planLimits: { guiches_max: 10, relatorios: true },
      enabledModules: ['masterfila'],
    });

    expect(ent.mods).toEqual(['masterfila']);
    expect(ent.limits).toEqual({ guiches_max: 10, relatorios: true });
  });

  it('trata plano sem limites como objeto vazio', () => {
    const ent = resolveEntitlements({ planLimits: null, enabledModules: [] });
    expect(ent.limits).toEqual({});
    expect(ent.mods).toEqual([]);
  });
});

describe('checkEntitlement', () => {
  const ent: Entitlements = {
    mods: ['masterfila'],
    limits: { guiches_max: 10, relatorios: true, beta: false },
  };

  it('permite módulo habilitado', () => {
    expect(checkEntitlement(ent, { module: 'masterfila' })).toEqual({ allowed: true });
  });

  it('nega módulo não habilitado', () => {
    expect(checkEntitlement(ent, { module: 'agenda' })).toEqual({
      allowed: false,
      reason: 'module_not_enabled',
    });
  });

  it('nega feature ausente do plano', () => {
    expect(checkEntitlement(ent, { feature: 'inexistente' })).toEqual({
      allowed: false,
      reason: 'feature_not_in_plan',
    });
  });

  it('permite feature booleana ligada', () => {
    expect(checkEntitlement(ent, { feature: 'relatorios' })).toEqual({ allowed: true });
  });

  it('nega feature booleana desligada', () => {
    expect(checkEntitlement(ent, { feature: 'beta' })).toEqual({
      allowed: false,
      reason: 'feature_disabled',
    });
  });

  it('permite limite numérico quando o uso está abaixo', () => {
    expect(checkEntitlement(ent, { feature: 'guiches_max', usage: 9 })).toEqual({ allowed: true });
  });

  it('nega quando o uso atinge o limite', () => {
    expect(checkEntitlement(ent, { feature: 'guiches_max', usage: 10 })).toEqual({
      allowed: false,
      reason: 'limit_exceeded',
      limit: 10,
    });
  });

  it('permite checar existência de limite numérico sem informar uso', () => {
    expect(checkEntitlement(ent, { feature: 'guiches_max' })).toEqual({ allowed: true });
  });

  it('valida módulo e feature juntos', () => {
    expect(checkEntitlement(ent, { module: 'agenda', feature: 'relatorios' })).toEqual({
      allowed: false,
      reason: 'module_not_enabled',
    });
  });

  it('permite quando nada é pedido', () => {
    expect(checkEntitlement(ent, {})).toEqual({ allowed: true });
  });
});
