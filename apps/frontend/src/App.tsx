import { Routes, Route, Link, useLocation } from 'react-router'
import { AppShell, Card } from '@wz/ui'

/**
 * Roteamento base do wz-connect: dois modos que compartilham o mesmo app
 * (Hub Admin em `/hub`, Org Admin em `/app`) — ver PRODUCT.md §2. Rotas de
 * negócio (login, onboarding, billing, etc.) são adicionadas pelas duas
 * frentes paralelas; este scaffold só confirma que @wz/ui, o roteador e o
 * Tailwind 4 com o tema compartilhado funcionam de ponta a ponta.
 */
export function App() {
  const location = useLocation()

  return (
    <AppShell
      brand="WZ Connect"
      sections={[
        {
          label: 'Plataforma',
          links: [{ to: '/hub', icon: '📊', label: 'Hub Admin' }],
        },
        {
          label: 'Organização',
          links: [{ to: '/app', icon: '🏢', label: 'Org Admin' }],
        },
      ]}
      userEmail=""
      onLogout={() => {}}
      LinkComponent={Link}
      isActive={(to) => location.pathname.startsWith(to)}
    >
      <Routes>
        <Route path="/hub" element={<PlaceholderPage title="Hub Admin" />} />
        <Route path="/app" element={<PlaceholderPage title="Org Admin" />} />
        <Route path="*" element={<PlaceholderPage title="WZ Connect" />} />
      </Routes>
    </AppShell>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <Card className="p-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Scaffold do monorepo — rotas de negócio chegam com as frentes de Auth e Billing.
        </p>
      </Card>
    </div>
  )
}
