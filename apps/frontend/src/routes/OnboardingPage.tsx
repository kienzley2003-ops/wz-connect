import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, Card, Input, Label, useToast } from '@wz/ui'
import { apiFetch, ApiError } from '../lib/api.js'

interface OnboardingForm {
  name: string
  slug: string
  billing_email: string
  adminEmail: string
  adminPassword: string
}

const EMPTY_FORM: OnboardingForm = {
  name: '',
  slug: '',
  billing_email: '',
  adminEmail: '',
  adminPassword: '',
}

export function OnboardingPage() {
  const { show } = useToast()
  const [form, setForm] = useState<OnboardingForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)

  function update<K extends keyof OnboardingForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch('/onboarding/organization', {
        method: 'POST',
        body: {
          name: form.name,
          slug: form.slug,
          billing_email: form.billing_email,
          admin: { email: form.adminEmail, password: form.adminPassword },
        },
      })
      // A org acabou de ser criada, mas /app exige que o navegador esteja no
      // subdomínio dela — tenancy é resolvida pelo Host (ADR 0003). Por isso
      // é um reload completo de página, não um navigate() do react-router.
      window.location.href = `${window.location.protocol}//${form.slug}.${window.location.host}/app`
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'slug-taken'
          ? 'Este identificador já está em uso — escolha outro.'
          : 'Não foi possível criar a organização. Confira os dados.'
      show({ type: 'danger', title: 'Erro ao criar organização', message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">Crie sua organização</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Dados da empresa e do administrador. A seleção de plano é uma etapa futura, ainda não disponível.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome da empresa</Label>
            <Input id="name" required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="slug">Identificador (subdomínio)</Label>
            <Input
              id="slug"
              required
              pattern="[a-z0-9-]+"
              title="Somente letras minúsculas, números e hífen"
              value={form.slug}
              onChange={(e) => update('slug', e.target.value.toLowerCase())}
            />
          </div>
          <div>
            <Label htmlFor="billing_email">E-mail de faturamento</Label>
            <Input
              id="billing_email"
              type="email"
              required
              value={form.billing_email}
              onChange={(e) => update('billing_email', e.target.value)}
            />
          </div>
          <hr className="border-slate-200 dark:border-slate-700" />
          <div>
            <Label htmlFor="adminEmail">Seu e-mail (administrador)</Label>
            <Input
              id="adminEmail"
              type="email"
              required
              value={form.adminEmail}
              onChange={(e) => update('adminEmail', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adminPassword">Senha</Label>
            <Input
              id="adminPassword"
              type="password"
              required
              minLength={8}
              value={form.adminPassword}
              onChange={(e) => update('adminPassword', e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Criando...' : 'Criar organização'}
          </Button>
        </form>
        <p className="text-xs text-slate-400 mt-4 text-center">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-primary">
            Entrar
          </Link>
        </p>
      </Card>
    </div>
  )
}
