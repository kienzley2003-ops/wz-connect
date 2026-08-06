# Preview de uso — @wz/ui

Exemplo mínimo de cada componente, para referência rápida sem precisar rodar Storybook (overkill para o MVP). Compare com `docs/design-system.md` para a justificativa de cada decisão visual.

```tsx
import {
  Button, Card, Badge, Modal, ConfirmModal, Spinner,
  ToastProvider, useToast, Input, Label, AppShell,
} from "@wz/ui";

function Example() {
  const { show } = useToast();

  return (
    <Card className="p-6 space-y-4">
      <div className="flex gap-2">
        <Button variant="primary">Salvar</Button>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="danger">Excluir</Button>
        <Button variant="ghost">Sair</Button>
      </div>

      <div className="flex gap-2">
        <Badge variant="success">online</Badge>
        <Badge variant="danger">crítico</Badge>
        <Badge variant="warning">atenção</Badge>
        <Badge variant="info">novo</Badge>
        <Badge variant="neutral">offline</Badge>
      </div>

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" placeholder="admin@empresa.com" />
      </div>

      <Button onClick={() => show({ type: "success", title: "Salvo!", message: "Alterações aplicadas." })}>
        Disparar toast
      </Button>

      <Spinner />
    </Card>
  );
}

// Uso do AppShell (Hub Admin, por exemplo):
<AppShell
  brand="WZ Connect"
  sections={[
    { label: "Plataforma", links: [{ to: "/hub", icon: "📊", label: "Dashboard" }] },
    { label: "Comércio", links: [{ to: "/hub/plans", icon: "💳", label: "Planos" }] },
  ]}
  userEmail="admin@wz-hub.com"
  onLogout={() => {}}
  LinkComponent={Link} // ex: react-router-dom
  isActive={(to) => location.pathname === to}
>
  <Example />
</AppShell>

// App raiz precisa envolver tudo em ToastProvider:
<ToastProvider>
  <App />
</ToastProvider>
```

## Fidelidade visual (checklist contra o wz-agente original)

- [ ] Cor de botão primário = `blue-600`/`blue-700` hover — igual ao `LoginPage.tsx` do wz-agente.
- [ ] Card com `rounded-2xl border shadow-sm` — igual ao `CARD` constant de `DashboardPage.tsx`.
- [ ] Badge com dot indicator e cores light/dark — igual ao `StatusBadge.tsx`.
- [ ] Modal com backdrop `bg-black/50` e painel `rounded-2xl shadow-2xl` — igual ao `ConfirmModal.tsx`.
- [ ] Spinner `border-4 border-blue-500 border-t-transparent animate-spin` — igual ao `Spinner.tsx`.
- [ ] Toast com cores sólidas por tipo e auto-dismiss 5s — mesmo visual do `ToastContainer.tsx`, implementação em Context em vez de DOM direto.
- [ ] Sidebar `w-56 bg-slate-800` com seções uppercase tracking-widest — igual ao `Layout.tsx`.
