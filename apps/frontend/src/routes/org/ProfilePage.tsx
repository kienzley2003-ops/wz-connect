import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Input, Label, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'
import { useAuth } from '../../lib/auth-context.js'

interface Session {
  id: string
  organizationId: string | null
  createdAt: string
}

interface MfaSetup {
  secret: string
  otpauthUrl: string
}

export function ProfilePage() {
  const { user } = useAuth()
  const { show } = useToast()
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadSessions() {
    try {
      const rows = await apiFetch<Session[]>('/sessions')
      setSessions(rows)
    } catch {
      setSessions([])
      show({ type: 'danger', title: 'Erro ao carregar sessões' })
    }
  }

  useEffect(() => {
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStartMfaSetup() {
    try {
      const data = await apiFetch<MfaSetup>('/mfa/setup')
      setSetup(data)
    } catch {
      show({ type: 'danger', title: 'Não foi possível iniciar a configuração de MFA' })
    }
  }

  async function handleEnableMfa(e: FormEvent) {
    e.preventDefault()
    if (!setup) return
    setBusy(true)
    try {
      await apiFetch('/mfa/enable', { method: 'POST', body: { secret: setup.secret, code } })
      show({ type: 'success', title: 'MFA ativado' })
      setSetup(null)
      setCode('')
    } catch {
      show({ type: 'danger', title: 'Código inválido' })
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      await apiFetch(`/sessions/${id}/revoke`, { method: 'POST' })
      await loadSessions()
    } catch {
      show({ type: 'danger', title: 'Não foi possível revogar a sessão' })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Perfil</h1>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">Conta</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Autenticação em duas etapas
        </h2>
        {!setup ? (
          <Button variant="secondary" onClick={handleStartMfaSetup}>
            Configurar MFA
          </Button>
        ) : (
          <form onSubmit={handleEnableMfa} className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Adicione esta chave no seu app autenticador (Google Authenticator, 1Password, etc.):
            </p>
            <code className="block bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-2 text-xs break-all">
              {setup.secret}
            </code>
            <a
              href={setup.otpauthUrl}
              className="text-xs text-primary block"
              target="_blank"
              rel="noreferrer"
            >
              Abrir no app autenticador (mesmo dispositivo)
            </a>
            <div>
              <Label htmlFor="mfaCode">Código de 6 dígitos</Label>
              <Input
                id="mfaCode"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Confirmando...' : 'Ativar'}
            </Button>
          </form>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Sessões ativas</h2>
        {sessions === null ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma sessão ativa.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between text-sm border-t border-slate-100 dark:border-slate-700 pt-2 first:border-0 first:pt-0"
              >
                <span className="text-slate-500 dark:text-slate-400">
                  Desde {new Date(s.createdAt).toLocaleString('pt-BR')}
                  {s.organizationId ? '' : ' (hub)'}
                </span>
                <Button variant="secondary" onClick={() => handleRevoke(s.id)}>
                  Revogar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
