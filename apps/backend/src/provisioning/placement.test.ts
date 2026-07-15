import { describe, it, expect } from 'vitest';
import {
  PlacementRegistry,
  UnknownPlacementError,
  placementFromUrl,
  type Placement,
} from './placement.js';

const def: Placement = {
  name: 'default',
  host: 'localhost',
  port: 5435,
  user: 'wz_connect',
  password: 'secret',
};
const dedicated: Placement = {
  name: 'enterprise',
  host: 'db-ent.internal',
  port: 5432,
  user: 'wz_admin',
  password: 'secret2',
};

describe('PlacementRegistry', () => {
  it('resolve um placement pelo nome', () => {
    const reg = new PlacementRegistry([def, dedicated]);
    expect(reg.get('enterprise')).toBe(dedicated);
  });

  it('lança UnknownPlacementError para placement desconhecido', () => {
    const reg = new PlacementRegistry([def]);
    expect(() => reg.get('fantasma')).toThrow(UnknownPlacementError);
  });

  it('has/names refletem os placements configurados', () => {
    const reg = new PlacementRegistry([def, dedicated]);
    expect(reg.has('default')).toBe(true);
    expect(reg.has('fantasma')).toBe(false);
    expect(reg.names()).toEqual(['default', 'enterprise']);
  });

  it('rejeita configuração sem nenhum placement', () => {
    expect(() => new PlacementRegistry([])).toThrow(/nenhum placement/i);
  });

  it('rejeita placements com nome duplicado', () => {
    expect(() => new PlacementRegistry([def, { ...dedicated, name: 'default' }])).toThrow(
      /duplicado/i,
    );
  });
});

describe('placementFromUrl', () => {
  it('deriva um placement de uma URL de conexão', () => {
    const p = placementFromUrl('default', 'postgres://u:p@localhost:5435/wz_connect_core');
    expect(p).toEqual({ name: 'default', host: 'localhost', port: 5435, user: 'u', password: 'p' });
  });

  it('usa a porta padrão do PostgreSQL quando a URL não traz porta', () => {
    const p = placementFromUrl('default', 'postgres://u:p@db.internal/core');
    expect(p.port).toBe(5432);
  });

  it('decodifica credenciais percent-encoded', () => {
    const p = placementFromUrl('default', 'postgres://u%40wz:p%3Aass@localhost:5432/core');
    expect(p.user).toBe('u@wz');
    expect(p.password).toBe('p:ass');
  });
});
