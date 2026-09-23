import { useEffect, useState, type FormEvent } from 'react'
import { Badge, Button, Card, Input, Label, Spinner, useToast } from '@wz/ui'
import type { BadgeVariant } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface Membership {
  id: string
  userId: string
  email: string
  role: string
  status: string
  createdAt: string
}

const ROLES = ['owner', 'admin', 'manager', 'operator', 'viewer']

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  invited: 'warning',
  suspended: 'neutral',
}

export function OrgUsersPage() {
  const { show } = useToast()
  const [members, setMembers] = useState<Membership[] | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('operator')
  const [inviting, setInviting] = useState(false)

  async function load() {
    try {
      const data = await apiFetch<Membership[]>('/memberships')
      setMembers(data)
    } catch {
      setMembers([])
      show({ type: 'danger', title: 'Erro ao carregar usuários' })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setInviting(true)
    try {
      await apiFetch('/invites', { method: 'POST', body: { email: inviteEmail, role: inviteRole } })
      show({ type: 'success', title: 'Convite enviado', message: inviteEmail })
      setInviteEmail('')
    } catch {
      show({ type: 'danger', title: 'Não foi possível convidar' })
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(id: string, role: string) {
    try {
      await apiFetch(`/memberships/${id}`, { method: 'PUT', body: { role } })
      await load()
    } catch {
      show({ type: 'danger', title: 'Não foi possível alterar o papel' })
    }
  }

  async function handleToggleStatus(m: Membership) {
    const nextStatus = m.status === 'suspended' ? 'active' : 'suspended'
    try {
      await apiFetch(`/memberships/${m.id}`, { method: 'PUT', body: { status: nextStatus } })
      await load()
    } catch {
      show({ type: 'danger', title: 'Não foi possível atualizar o status' })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Usuários</h1>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Convidar usuário</h2>
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="inviteEmail">E-mail</Label>
            <Input
              id="inviteEmail"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inviteRole">Papel</Label>
            <select
              id="inviteRole"
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={inviting}>
            {inviting ? 'Enviando...' : 'Convidar'}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Membros</h2>
        {members === null ? (
          <Spinner />
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum usuário ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">E-mail</th>
                <th className="pb-2">Papel</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 text-slate-700 dark:text-slate-300">{m.email}</td>
                  <td className="py-2">
                    <select
                      className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <Badge variant={STATUS_VARIANT[m.status] ?? 'neutral'}>{m.status}</Badge>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" onClick={() => handleToggleStatus(m)}>
                      {m.status === 'suspended' ? 'Reativar' : 'Suspender'}
                    </Button>
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
