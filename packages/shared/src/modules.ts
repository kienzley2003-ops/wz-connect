/**
 * Catálogo de módulos de produto da suíte (fonte única — DRY).
 * O backend usa para nomear/registrar os plugins; o frontend, para rotular a
 * navegação dinâmica. As chaves espelham `modules.chave` no CORE.
 */
export interface ModuleCatalogEntry {
  readonly key: string;
  readonly label: string;
  /** Caminho base no frontend e prefixo das rotas do módulo no backend. */
  readonly path: string;
}

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  { key: 'masterfila', label: 'MasterFila', path: '/masterfila' },
  { key: 'agenda', label: 'Agenda', path: '/agenda' },
] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]['key'];

/** Metadados de um módulo do catálogo, ou `undefined` se desconhecido. */
export function findModule(key: string): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find((m) => m.key === key);
}
