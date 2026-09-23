import { useEffect, useState, type FormEvent } from 'react'
import { Badge, Button, Card, Input, Label, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface Organization {
  id: string
  name: string
  slug: string
}

interface FeatureFlag {
  id: string
  organizationId: string
  key: string
  enabled: boolean
  createdAt: string
}

export function HubFeatureFlagsPage() {
  const { show } = useToast()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null)
  const [newKey, setNewKey] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    apiFetch<Organization[]>('/organizations')
      .then((rows) => {
        setOrgs(rows)
        if (rows.length > 0) setOrganizationId(rows[0].id)
      })
      .catch(() => show({ type: 'danger', title: 'Erro ao carregar organizações' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadFlags(orgId: string) {
    if (!orgId) return
    try {
      setFlags(await apiFetch<FeatureFlag[]>(`/feature-flags?organizationId=${orgId}`))
    } catch {
      setFlags([])
      show({ type: 'danger', title: 'Erro ao carregar feature flags' })
    }
  }

  useEffect(() => {
    setFlags(null)
    loadFlags(organizationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  async function toggle(flag: FeatureFlag) {
    try {
      await apiFetch('/feature-flags', {
        method: 'PUT',
        body: { organizationId, key: flag.key, enabled: !flag.enabled },
      })
      await loadFlags(organizationId)
    } catch {
      show({ type: 'danger', title: 'Não foi possível atualizar o flag' })
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await apiFetch('/feature-flags', { method: 'PUT', body: { organizationId, key: newKey, enabled: true } })
      setNewKey('')
      await loadFlags(organizationId)
    } catch {
      show({ type: 'danger', title: 'Não foi possível criar o flag' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Feature flags</h1>

      <Card className="p-6 space-y-4">
        <div className="max-w-xs">
          <Label htmlFor="org">Organização</Label>
          <select
            id="org"
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="newKey">Nova key</Label>
            <Input id="newKey" required value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          </div>
          <Button type="submit" disabled={creating || !organizationId}>
            {creating ? 'Criando...' : 'Ligar flag'}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        {flags === null ? (
          <Spinner />
        ) : flags.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum flag para esta organização ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">Key</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{flag.key}</td>
                  <td className="py-2">
                    <Badge variant={flag.enabled ? 'success' : 'neutral'}>
                      {flag.enabled ? 'ligado' : 'desligado'}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" onClick={() => toggle(flag)}>
                      {flag.enabled ? 'Desligar' : 'Ligar'}
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
