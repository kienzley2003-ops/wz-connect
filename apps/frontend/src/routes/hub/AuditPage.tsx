import { useEffect, useState } from 'react'
import { Badge, Card, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface AuditEvent {
  id: string
  organizationId: string | null
  actorId: string
  impersonatedBy: string | null
  product: string
  action: string
  target: string | null
  createdAt: string
}

export function HubAuditPage() {
  const { show } = useToast()
  const [events, setEvents] = useState<AuditEvent[] | null>(null)

  useEffect(() => {
    apiFetch<AuditEvent[]>('/audit-events')
      .then(setEvents)
      .catch(() => show({ type: 'danger', title: 'Erro ao carregar auditoria' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Auditoria global</h1>

      <Card className="p-6">
        {events === null ? (
          <Spinner />
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum evento registrado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">Quando</th>
                <th className="pb-2">Produto</th>
                <th className="pb-2">Ação</th>
                <th className="pb-2">Alvo</th>
                <th className="pb-2">Impersonação</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(ev.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2">
                    <Badge variant="info">{ev.product}</Badge>
                  </td>
                  <td className="py-2 text-slate-700 dark:text-slate-300">{ev.action}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                    {ev.target ?? '—'}
                  </td>
                  <td className="py-2">
                    {ev.impersonatedBy ? <Badge variant="warning">sim</Badge> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
