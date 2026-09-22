import { useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router'
import { Button, Card, Input, Label, Spinner } from '@wz/ui'
import { apiFetch, ApiError } from '../lib/api.js'
import { useAuth } from '../lib/auth-context.js'

interface InvitePreview {
  organizationName: string
  organizationSlug: string
  role: string
  expired: boolean
}

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const { user, refresh, logout } = useAuth()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mismatch, setMismatch] = useState(false)

  useEffect(() => {
    if (!token) return
    apiFetch<InvitePreview>(`/invites/${token}`)
      .then(setPreview)
      .catch(() => setNotFound(true))
  }, [token])

  async function handleAccept(e: FormEvent) {
    e.preventDefault()
    if (!token || !preview) return
    setSubmitting(true)
    setMismatch(false)
    try {
      await apiFetch(`/invites/${token}/accept`, {
        method: 'POST',
        body: user ? {} : { password },
      })
      await refresh()
      // Mesma razão do onboarding e do impersonate: /app exige que o
      // navegador esteja no subdomínio da org (tenancy por Host — ADR 0003).
      window.location.href = `${window.location.protocol}//${preview.organizationSlug}.${window.location.host}/app`
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invite-email-mismatch') {
        setMismatch(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">Convite</h1>

        {notFound ? (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
              Este convite não existe mais ou expirou.
            </p>
            <Link to="/login" className="text-sm text-primary block mt-4">
              Ir para o login
            </Link>
          </>
        ) : !preview ? (
          <Spinner />
        ) : preview.expired ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
            Este convite expirou. Peça para um administrador de {preview.organizationName} enviar um
            novo.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Você foi convidado para entrar em <strong>{preview.organizationName}</strong> como{' '}
              <strong>{preview.role}</strong>.
            </p>

            {mismatch && user && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                Este convite foi enviado para outro e-mail. Saia da conta atual e tente de novo.
              </p>
            )}
            {mismatch && !user && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                Já existe uma conta com esse e-mail. Entre com ela e abra este link de novo.
              </p>
            )}

            {user ? (
              <form onSubmit={handleAccept} className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Você está logado como <strong>{user.email}</strong>.
                </p>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Aceitando...' : 'Aceitar convite'}
                </Button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 block mx-auto"
                >
                  Não é você? Sair
                </button>
              </form>
            ) : (
              <form onSubmit={handleAccept} className="space-y-4">
                <div>
                  <Label htmlFor="password">Crie uma senha</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Aceitando...' : 'Criar conta e aceitar'}
                </Button>
                <p className="text-xs text-slate-400 text-center">
                  Já tem uma conta?{' '}
                  <Link to="/login" className="text-primary">
                    Entre primeiro
                  </Link>
                </p>
              </form>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
