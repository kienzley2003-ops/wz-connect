import { useEffect, useState } from 'react'
import { Badge, Button, Card, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface HubUser {
  id: string
  email: string
  isSuperAdmin: boolean
  mfaEnabled: boolean
  createdAt: string
}

export function HubUsersPage() {
  const { show } = useToast()
  const [users, setUsers] = useState<HubUser[] | null>(null)

  async function load() {
    try {
      const rows = await apiFetch<HubUser[]>('/users')
      setUsers(rows)
    } catch {
      setUsers([])
      show({ type: 'danger', title: 'Erro ao carregar usuários' })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleSuperAdmin(u: HubUser) {
    try {
      await apiFetch(`/users/${u.id}/super-admin`, {
        method: 'PUT',
        body: { isSuperAdmin: !u.isSuperAdmin },
      })
      await load()
    } catch {
      show({ type: 'danger', title: 'Não foi possível alterar o super-admin' })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Usuários globais</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Todos os usuários do hub. Marque um usuário como super-admin para dar acesso ao Hub Admin.
      </p>

      <Card className="p-6">
        {users === null ? (
          <Spinner />
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum usuário ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">E-mail</th>
                <th className="pb-2">MFA</th>
                <th className="pb-2">Super-admin</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 text-slate-700 dark:text-slate-300">{u.email}</td>
                  <td className="py-2">
                    <Badge variant={u.mfaEnabled ? 'success' : 'neutral'}>
                      {u.mfaEnabled ? 'ativo' : 'inativo'}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Badge variant={u.isSuperAdmin ? 'info' : 'neutral'}>
                      {u.isSuperAdmin ? 'sim' : 'não'}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" onClick={() => toggleSuperAdmin(u)}>
                      {u.isSuperAdmin ? 'Revogar super-admin' : 'Promover a super-admin'}
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
