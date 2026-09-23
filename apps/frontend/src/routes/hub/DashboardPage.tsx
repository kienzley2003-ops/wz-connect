import { useEffect, useState } from 'react'
import { Card, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface DashboardSummary {
  totalOrganizations: number
  activeSubscriptions: number
  mrrCents: number
  newSignupsLast30Days: number
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </Card>
  )
}

export function HubDashboardPage() {
  const { show } = useToast()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    apiFetch<DashboardSummary>('/billing/dashboard')
      .then(setSummary)
      .catch(() => {
        setLoadError(true)
        show({ type: 'danger', title: 'Erro ao carregar o dashboard' })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>

      {loadError ? (
        <Card className="p-6 border-red-200 dark:border-red-900">
          <p className="text-sm text-red-600 dark:text-red-400">
            Não foi possível carregar o dashboard. Tente novamente mais tarde.
          </p>
        </Card>
      ) : summary === null ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Organizações" value={String(summary.totalOrganizations)} />
          <StatCard label="Assinaturas ativas" value={String(summary.activeSubscriptions)} />
          <StatCard label="MRR" value={formatCents(summary.mrrCents)} />
          <StatCard label="Novos signups (30 dias)" value={String(summary.newSignupsLast30Days)} />
        </div>
      )}
    </div>
  )
}
