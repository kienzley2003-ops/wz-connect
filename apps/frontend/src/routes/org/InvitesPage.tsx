import { useEffect, useState } from 'react'
import { Badge, Card, Spinner, useToast } from '@wz/ui'
import type { BadgeVariant } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface Invite {
  id: string
  email: string
  role: string
  expiresAt: string
  acceptedAt: string | null
  expired: boolean
  createdAt: string
}

function statusOf(invite: Invite): { label: string; variant: BadgeVariant } {
  if (invite.acceptedAt) return { label: 'aceito', variant: 'success' }
  if (invite.expired) return { label: 'expirado', variant: 'neutral' }
  return { label: 'pendente', variant: 'warning' }
}

export function OrgInvitesPage() {
  const { show } = useToast()
  const [invites, setInvites] = useState<Invite[] | null>(null)

  useEffect(() => {
    apiFetch<Invite[]>('/invites')
      .then(setInvites)
      .catch(() => show({ type: 'danger', title: 'Erro ao carregar convites' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Convites</h1>

      <Card className="p-6">
        {invites === null ? (
          <Spinner />
        ) : invites.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum convite enviado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">E-mail</th>
                <th className="pb-2">Papel</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Expira em</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const status = statusOf(inv)
                return (
                  <tr key={inv.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-2 text-slate-700 dark:text-slate-300">{inv.email}</td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{inv.role}</td>
                    <td className="py-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">
                      {new Date(inv.expiresAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
