import type { AdminTenant, ModuleCatalogItem } from '../lib/api.js';

export interface TenantListProps {
  readonly tenants: readonly AdminTenant[];
  readonly catalog: readonly ModuleCatalogItem[];
  readonly onProvision: (id: string) => Promise<void>;
  /** Recebe a lista COMPLETA desejada de módulos, não o toggle isolado. */
  readonly onToggleModule: (id: string, modules: string[]) => Promise<void>;
}

const STATUS_STYLE: Record<AdminTenant['status'], string> = {
  ativo: 'bg-emerald-900 text-emerald-300',
  provisionando: 'bg-amber-900 text-amber-300',
  suspenso: 'bg-red-900 text-red-300',
  encerrado: 'bg-slate-800 text-slate-400',
};

/** Administração de empresas: provisionar e contratar módulos (platform admin). */
export function TenantList({ tenants, catalog, onProvision, onToggleModule }: TenantListProps) {
  if (tenants.length === 0) {
    return <p className="text-slate-400">Nenhuma empresa cadastrada ainda.</p>;
  }

  return (
    <ul className="space-y-3">
      {tenants.map((t) => {
        const provisionada = t.status === 'ativo';
        return (
          <li key={t.id} className="rounded-lg bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{t.nome}</p>
                <p className="text-xs text-slate-400">
                  <span>{t.subdominio}</span>
                  {!provisionada && <span className="ml-2 text-amber-400">· sem banco ainda</span>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded px-2 py-1 text-xs ${STATUS_STYLE[t.status]}`}>
                  {t.status}
                </span>
                {!provisionada && (
                  <button
                    onClick={() => void onProvision(t.id)}
                    className="rounded bg-sky-600 px-3 py-1 text-sm font-medium"
                  >
                    Provisionar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-800 pt-3">
              {catalog.map((m) => {
                const contratado = t.modules.includes(m.chave);
                return (
                  <label key={m.chave} className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={contratado}
                      aria-label={m.nome}
                      onChange={() =>
                        void onToggleModule(
                          t.id,
                          contratado
                            ? t.modules.filter((k) => k !== m.chave)
                            : [...t.modules, m.chave],
                        )
                      }
                    />
                    {m.nome}
                  </label>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
