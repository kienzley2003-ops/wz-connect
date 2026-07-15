import type { DashboardMetric, DashboardResponse } from '@wz/shared';
import { findModule } from '@wz/shared';

export interface DashboardProps {
  /** `null` enquanto carrega. */
  readonly data: DashboardResponse | null;
  /** Código do erro, quando a busca falhou. */
  readonly error?: string | null;
}

const formatNumber = (n: number): string => new Intl.NumberFormat('pt-BR').format(n);

function groupByModule(metrics: readonly DashboardMetric[]): Map<string, DashboardMetric[]> {
  const groups = new Map<string, DashboardMetric[]>();
  for (const metric of metrics) {
    const list = groups.get(metric.module) ?? [];
    list.push(metric);
    groups.set(metric.module, list);
  }
  return groups;
}

/** Painel consolidado: métricas de todos os módulos do tenant (ADR-013). */
export function Dashboard({ data, error }: DashboardProps) {
  // Erro antes de tudo: engolir a falha e seguir mostrando "Carregando" faz o
  // painel quebrado parecer lento — foi exatamente o que aconteceu uma vez.
  if (error) {
    return (
      <p role="alert" className="rounded bg-red-950 p-3 text-sm text-red-300">
        Não foi possível carregar o painel ({error}).
      </p>
    );
  }
  if (!data) {
    return <p className="text-slate-400">Carregando métricas…</p>;
  }
  if (data.metrics.length === 0) {
    return (
      <p className="text-slate-400">
        Nenhuma métrica reportada ainda. Os módulos enviam dados conforme são usados.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {[...groupByModule(data.metrics)].map(([moduleKey, metrics]) => (
        <section key={moduleKey}>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">
            {findModule(moduleKey)?.label ?? moduleKey}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.metric} className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs text-slate-400">{m.metric}</p>
                <p className="mt-1 text-2xl font-bold">{formatNumber(m.total)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {m.points} {m.points === 1 ? 'janela' : 'janelas'}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
