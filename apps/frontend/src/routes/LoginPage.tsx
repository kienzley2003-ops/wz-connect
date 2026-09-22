import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Card, Input, Label, useToast } from '@wz/ui'
import { apiFetch, ApiError } from '../lib/api.js'
import { useAuth } from '../lib/auth-context.js'

export function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const { show } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function afterLogin(role: string) {
    await refresh()
    navigate(role === 'super_admin' ? '/hub' : '/app', { replace: true })
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await apiFetch<{ mfaChallenge?: string; role?: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      if (res.mfaChallenge) {
        setMfaChallenge(res.mfaChallenge)
      } else if (res.role) {
        await afterLogin(res.role)
      }
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'account-locked'
          ? 'Conta bloqueada por excesso de tentativas. Tente novamente mais tarde.'
          : 'E-mail ou senha inválidos.'
      show({ type: 'danger', title: 'Não foi possível entrar', message })
    } finally {
      setLoading(false)
    }
  }

  async function handleMfa(e: FormEvent) {
    e.preventDefault()
    if (!mfaChallenge) return
    setLoading(true)
    try {
      const res = await apiFetch<{ role: string }>('/auth/mfa', {
        method: 'POST',
        body: { mfaChallenge, code },
      })
      await afterLogin(res.role)
    } catch {
      show({ type: 'danger', title: 'Código inválido', message: 'Confira o código do seu autenticador.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">WZ Connect</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {mfaChallenge ? 'Confirme o código do seu autenticador' : 'Entre com sua conta'}
        </p>

        {!mfaChallenge ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleMfa} className="space-y-4">
            <div>
              <Label htmlFor="code">Código de 6 dígitos</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Confirmando...' : 'Confirmar'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
