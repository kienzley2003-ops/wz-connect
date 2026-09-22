import { useEffect, useState } from 'react'
import { Button, Card, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface Organization {
  id: string
  name: string
  slug: string
  cnpj: string | null
  billingEmail: string | null
  createdAt: string
}

export function HubOrganizationsPage() {
  const { show } = useToast()
  const [orgs, setOrgs] = useState<Organization[] | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Organization[]>('/organizations')
      .then(setOrgs)
      .catch(() => show({ type: 'danger', title: 'Erro ao carregar organizações' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleImpersonate(org: Organization) {
    setImpersonating(org.id)
    try {
      await apiFetch(`/impersonate/${org.id}`, { method: 'POST' })
      // Mesma razão do onboarding: /app precisa do navegador no subdomínio
      // da org sendo impersonada, então é reload completo, não navigate().
      window.location.href = `${window.location.protocol}//${org.slug}.${window.location.host}/app`
    } catch {
      show({ type: 'danger', title: 'Não foi possível impersonar esta organização' })
      setImpersonating(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Organizações</h1>

      <Card className="p-6">
        {orgs === null ? (
          <Spinner />
        ) : orgs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma organização ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">Nome</th>
                <th className="pb-2">Subdomínio</th>
                <th className="pb-2">Criada em</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 text-slate-700 dark:text-slate-300">{org.name}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{org.slug}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">
                    {new Date(org.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="secondary"
                      disabled={impersonating === org.id}
                      onClick={() => handleImpersonate(org)}
                    >
                      {impersonating === org.id ? 'Entrando...' : 'Impersonar'}
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
