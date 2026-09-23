import { useEffect, useState, type FormEvent } from 'react'
import { Badge, Button, Card, Input, Label, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface Product {
  id: string
  key: string
  name: string
}

interface Plan {
  id: string
  key: string
  name: string
  priceCents: number
  billingInterval: 'month' | 'year'
  products: { productId: string; limits: Record<string, number> }[]
  createdAt: string
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function HubPlansPage() {
  const { show } = useToast()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      const [planRows, productRows] = await Promise.all([
        apiFetch<Plan[]>('/plans'),
        apiFetch<Product[]>('/products'),
      ])
      setPlans(planRows)
      setProducts(productRows)
    } catch {
      setPlans([])
      show({ type: 'danger', title: 'Erro ao carregar planos' })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleProduct(id: string) {
    setSelectedProducts((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const priceCents = Math.round(Number(price.replace(',', '.')) * 100)
      await apiFetch('/plans', {
        method: 'POST',
        body: {
          key,
          name,
          priceCents,
          billingInterval,
          products: selectedProducts.map((productId) => ({ productId })),
        },
      })
      show({ type: 'success', title: 'Plano criado', message: key })
      setKey('')
      setName('')
      setPrice('')
      setSelectedProducts([])
      await load()
    } catch {
      show({ type: 'danger', title: 'Não foi possível criar o plano' })
    } finally {
      setCreating(false)
    }
  }

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Planos</h1>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Novo plano</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor="planKey">Key</Label>
              <Input id="planKey" required value={key} onChange={(e) => setKey(e.target.value)} className="w-32" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label htmlFor="planName">Nome</Label>
              <Input id="planName" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="price">Preço (R$)</Label>
              <Input
                id="price"
                required
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-28"
              />
            </div>
            <div>
              <Label htmlFor="interval">Cobrança</Label>
              <select
                id="interval"
                className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
                value={billingInterval}
                onChange={(e) => setBillingInterval(e.target.value as 'month' | 'year')}
              >
                <option value="month">Mensal</option>
                <option value="year">Anual</option>
              </select>
            </div>
          </div>

          {products.length > 0 && (
            <div>
              <Label>Produtos incluídos</Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" disabled={creating}>
            {creating ? 'Criando...' : 'Criar plano'}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        {plans === null ? (
          <Spinner />
        ) : plans.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum plano ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">Key</th>
                <th className="pb-2">Nome</th>
                <th className="pb-2">Preço</th>
                <th className="pb-2">Produtos</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{plan.key}</td>
                  <td className="py-2 text-slate-700 dark:text-slate-300">{plan.name}</td>
                  <td className="py-2 text-slate-700 dark:text-slate-300">
                    {formatPrice(plan.priceCents)} / {plan.billingInterval === 'month' ? 'mês' : 'ano'}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {plan.products.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        plan.products.map((pp) => (
                          <Badge key={pp.productId} variant="info">
                            {productName(pp.productId)}
                          </Badge>
                        ))
                      )}
                    </div>
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
