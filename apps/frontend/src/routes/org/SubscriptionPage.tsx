import { useEffect, useState } from 'react'
import { Badge, Card, Spinner, useToast } from '@wz/ui'
import type { BadgeVariant } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface Subscription {
  planId: string
  planKey: string
  planName: string
  priceCents: number
  billingInterval: 'month' | 'year'
  status: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  canceledAt: string | null
}

interface Plan {
  id: string
  key: string
  name: string
  priceCents: number
  billingInterval: 'month' | 'year'
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  canceled: 'neutral',
  incomplete: 'neutral',
  incomplete_expired: 'danger',
  unpaid: 'danger',
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}

export function SubscriptionPage() {
  const { show } = useToast()
  const [subscription, setSubscription] = useState<Subscription | null | undefined>(undefined)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    apiFetch<Subscription | null>('/billing/subscription')
      .then(setSubscription)
      .catch(() => {
        setLoadError(true)
        show({ type: 'danger', title: 'Erro ao carregar assinatura' })
      })
    apiFetch<Plan[]>('/plans')
      .then(setPlans)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Assinatura</h1>

      {loadError ? (
        <Card className="p-6">
          <p className="text-sm text-red-600 dark:text-red-400">
            Não foi possível carregar a assinatura. Tente novamente mais tarde.
          </p>
        </Card>
      ) : subscription === undefined ? (
        <Spinner />
      ) : subscription ? (
        <Card className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{subscription.planName}</h2>
            <Badge variant={STATUS_VARIANT[subscription.status] ?? 'neutral'}>{subscription.status}</Badge>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatPrice(subscription.priceCents)} / {subscription.billingInterval === 'month' ? 'mês' : 'ano'}
          </p>
          <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-700">
            {subscription.trialEndsAt && <p>Trial até {formatDate(subscription.trialEndsAt)}</p>}
            {subscription.currentPeriodEnd && <p>Próxima cobrança em {formatDate(subscription.currentPeriodEnd)}</p>}
            {subscription.canceledAt && <p>Cancelada em {formatDate(subscription.canceledAt)}</p>}
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Sua organização ainda não tem uma assinatura ativa.
            </p>
          </Card>

          {plans.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-3">Planos disponíveis</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {plans.map((plan) => (
                  <Card key={plan.id} className="p-6">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{plan.name}</h3>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                      {formatPrice(plan.priceCents)}
                      <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                        {' '}
                        / {plan.billingInterval === 'month' ? 'mês' : 'ano'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400 mt-4">
                      Assinatura via cartão ainda não está disponível — em breve.
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
