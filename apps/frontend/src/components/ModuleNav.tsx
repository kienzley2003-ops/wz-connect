import { buildNavItems } from '../lib/nav.js';

export interface ModuleNavProps {
  /** Módulos habilitados para o tenant (claim `mods` de `GET /auth/me`). */
  readonly mods: readonly string[];
}

/** Navegação dinâmica: só aparece o que o tenant tem contratado (ADR-007). */
export function ModuleNav({ mods }: ModuleNavProps) {
  const items = buildNavItems(mods);

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Nenhum módulo habilitado para esta empresa. Fale com o administrador.
      </p>
    );
  }

  return (
    <nav aria-label="Módulos">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <a
              href={item.path}
              className="block rounded px-3 py-2 text-slate-200 hover:bg-slate-800"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
