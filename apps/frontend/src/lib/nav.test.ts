import { describe, it, expect } from 'vitest';
import { buildNavItems } from './nav.js';
import type { ModuleCatalogEntry } from '@wz/shared';

const catalog: ModuleCatalogEntry[] = [
  { key: 'masterfila', label: 'MasterFila', path: '/masterfila' },
  { key: 'agenda', label: 'Agenda', path: '/agenda' },
];

describe('buildNavItems', () => {
  it('inclui só os módulos habilitados para o tenant', () => {
    expect(buildNavItems(['masterfila'], catalog)).toEqual([
      { key: 'masterfila', label: 'MasterFila', path: '/masterfila' },
    ]);
  });

  it('respeita a ordem do catálogo, não a dos módulos habilitados', () => {
    expect(buildNavItems(['agenda', 'masterfila'], catalog).map((i) => i.key)).toEqual([
      'masterfila',
      'agenda',
    ]);
  });

  it('ignora chaves habilitadas que não estão no catálogo', () => {
    expect(buildNavItems(['masterfila', 'fantasma'], catalog).map((i) => i.key)).toEqual([
      'masterfila',
    ]);
  });

  it('retorna vazio quando o tenant não tem módulos', () => {
    expect(buildNavItems([], catalog)).toEqual([]);
  });
});
