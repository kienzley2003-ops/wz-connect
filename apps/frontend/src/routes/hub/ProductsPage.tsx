import { useEffect, useState, type FormEvent } from 'react'
import { Badge, Button, Card, Input, Label, Spinner, useToast } from '@wz/ui'
import { apiFetch } from '../../lib/api.js'

interface Product {
  id: string
  key: string
  name: string
  description: string | null
  active: boolean
  createdAt: string
}

export function HubProductsPage() {
  const { show } = useToast()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      setProducts(await apiFetch<Product[]>('/products'))
    } catch {
      setProducts([])
      show({ type: 'danger', title: 'Erro ao carregar produtos' })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await apiFetch('/products', { method: 'POST', body: { key, name, description: description || undefined } })
      show({ type: 'success', title: 'Produto criado', message: key })
      setKey('')
      setName('')
      setDescription('')
      await load()
    } catch {
      show({ type: 'danger', title: 'Não foi possível criar o produto' })
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(product: Product) {
    try {
      await apiFetch(`/products/${product.id}`, { method: 'PUT', body: { active: !product.active } })
      await load()
    } catch {
      show({ type: 'danger', title: 'Não foi possível atualizar o produto' })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Produtos</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Catálogo de produtos do hub (masterfila, desk, orc, agente...) que compõem os planos.
      </p>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Novo produto</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="key">Key</Label>
            <Input id="key" required value={key} onChange={(e) => setKey(e.target.value)} className="w-40" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? 'Criando...' : 'Criar'}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        {products === null ? (
          <Spinner />
        ) : products.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum produto ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="pb-2">Key</th>
                <th className="pb-2">Nome</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{p.key}</td>
                  <td className="py-2 text-slate-700 dark:text-slate-300">{p.name}</td>
                  <td className="py-2">
                    <Badge variant={p.active ? 'success' : 'neutral'}>{p.active ? 'ativo' : 'inativo'}</Badge>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" onClick={() => toggleActive(p)}>
                      {p.active ? 'Desativar' : 'Ativar'}
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
