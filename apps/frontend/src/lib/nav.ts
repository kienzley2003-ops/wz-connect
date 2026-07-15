import { MODULE_CATALOG, type ModuleCatalogEntry } from '@wz/shared';

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly path: string;
}

/**
 * Monta a navegação a partir dos módulos habilitados para o tenant
 * (claim `mods`, vindo de `GET /auth/me`), cruzando com o catálogo compartilhado.
 * A ordem segue o catálogo, para a navegação ser estável entre tenants.
 */
export function buildNavItems(
  mods: readonly string[],
  catalog: readonly ModuleCatalogEntry[] = MODULE_CATALOG,
): NavItem[] {
  return catalog
    .filter((entry) => mods.includes(entry.key))
    .map((entry) => ({ key: entry.key, label: entry.label, path: entry.path }));
}
