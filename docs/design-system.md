# Design System do wz-hub

**Status:** Aceito
**Origem:** extraído de `wz-agente/apps/frontend` — o frontend mais maduro do hub, escolhido pelo usuário como padrão estético para todos os produtos do wz-hub (não só o `wz-connect`).

> **Regra de ouro:** qualquer tela nova do wz-connect (Hub Admin ou Org Admin) usa os primitivos de `@wz/ui` — não se inventa um novo padrão visual ad-hoc. Se um componente que você precisa não existe em `@wz/ui`, adicione-o lá (em um commit/PR próprio contra `develop`), não resolva com Tailwind solto na tela.

## 1. Por que copiar o wz-agente, e não criar do zero

O `wz-agente` tem 22 páginas e 12 componentes reutilizáveis já validados em produção, com um vocabulário visual consistente (cards, badges, modais, sidebar) construído ao longo de 14 ADRs. Reaproveitar essa linguagem visual dá ao wz-hub uma identidade única entre produtos, e evita que o `wz-connect` — construído por duas frentes em paralelo, cada uma em uma máquina — acabe com dois estilos de botão diferentes.

## 2. Tradução de stack: Tailwind 3 → Tailwind 4

O `wz-agente` usa **Tailwind 3.4** com configuração em `tailwind.config.js` (`darkMode: "class"`, `theme.extend` vazio — usa a paleta padrão do Tailwind sem customização). O `wz-connect` usa **Tailwind 4**, que trocou o modelo de configuração JS por CSS-first (diretiva `@theme`). A tradução:

| Tailwind 3 (wz-agente) | Tailwind 4 (wz-connect) |
|---|---|
| `tailwind.config.js` com `darkMode: "class"` | `@custom-variant dark (&:where(.dark, .dark *))` no CSS |
| `theme.extend` (vazio — usa paleta padrão) | `@theme { --color-primary: ...; }` no CSS, mapeando os mesmos valores da paleta padrão do Tailwind que o wz-agente já usava |
| `presets: [...]` para compartilhar config entre apps | `@import "@wz/ui/theme.css";` no CSS de entrada de cada app |

O resultado visual é **idêntico** — só muda onde a configuração mora. Nenhuma cor, raio ou espaçamento muda de valor nessa tradução.

## 3. Paleta de cores

Base: cores padrão do Tailwind (`slate`, `blue`, `green`, `red`, `amber`), sem paleta de marca customizada — é assim que o wz-agente já funciona, e mantemos.

| Papel semântico | Uso | Light | Dark |
|---|---|---|---|
| `primary` | Ação principal, links, foco de input | `blue-600` (`#2563eb`) | `blue-600` (mesmo tom, hover `blue-700`) |
| `success` | Status "online", confirmação, sucesso | `bg-green-100 text-green-800` | `bg-green-500/15 text-green-300` |
| `danger` | Erro, ação destrutiva, severidade crítica | `bg-red-100 text-red-800` / botão `bg-red-600` | `bg-red-500/15 text-red-300` |
| `warning` | Aviso, severidade média | `bg-amber-100 text-amber-800` | `bg-amber-500/15 text-amber-300` |
| `info` | Neutro informativo, severidade baixa | `bg-blue-100 text-blue-800` | `bg-blue-500/15 text-blue-300` |
| `neutral` (fundo) | Fundo de página | `bg-slate-100` | `bg-slate-900` |
| `neutral` (superfície) | Cards, modais, sidebar de conteúdo | `bg-white` | `bg-slate-800` |
| `neutral` (sidebar) | Navegação lateral | `bg-slate-800` (fixo, não muda no dark) | `bg-slate-800` |
| `neutral` (texto primário) | Texto principal | `text-slate-800` | `text-slate-100` |
| `neutral` (texto secundário) | Labels, legendas, timestamps | `text-slate-500` / `text-slate-400` | `text-slate-400` / `text-slate-500` |
| `neutral` (borda) | Divisores, contorno de card/input | `border-slate-200` / `border-slate-300` | `border-slate-700` / `border-slate-600` |

**Regra de badges/status:** sempre par light+dark com opacidade reduzida no dark (`/15`), nunca a cor sólida do Tailwind no modo escuro — evita saturação excessiva em fundo escuro.

## 4. Tipografia

Sem fonte customizada — stack padrão do sistema operacional (nenhum `@font-face` nem Google Fonts no wz-agente). Mantemos essa escolha: menos uma dependência de rede, carregamento instantâneo.

| Escala | Uso |
|---|---|
| `text-3xl font-bold` | Valor de destaque em KPI card |
| `text-2xl font-bold` | Título de página / marca no topo da sidebar |
| `text-lg font-bold` | Marca compacta (ex.: nome do produto na sidebar) |
| `text-base font-semibold` | Título de card, título de modal |
| `text-sm font-medium` | Texto de botão, label de input, nav link |
| `text-sm` | Corpo de texto padrão |
| `text-xs font-semibold uppercase tracking-widest` | Cabeçalho de seção (ex.: seções da sidebar) |
| `text-xs` | Legendas, timestamps, texto auxiliar |

## 5. Espaçamento e raio de borda

| Elemento | Raio | Notas |
|---|---|---|
| Botão, input, dropdown de ação | `rounded-lg` | Controles interativos |
| Card, modal, dropdown de painel (notificações) | `rounded-2xl` (modais grandes) / `rounded-xl` (dropdowns menores) | Superfícies de conteúdo |
| Badge/pill | `rounded-full` | Sempre pill, nunca quadrado |
| Avatar/ícone circular | `rounded-xl` (quadrado com cantos) ou `rounded-full` (círculo) | Depende do contexto — ícone de KPI usa `rounded-xl`, indicador de status usa `rounded-full` |

Sombra: `shadow-sm` em cards de conteúdo (sutil), `shadow-md` no hover de card interativo, `shadow-xl`/`shadow-2xl` em modais e dropdowns flutuantes (para destacar do fundo).

## 6. Dark mode

Estratégia: classe `dark` no elemento `<html>`, alternada via toggle, persistida em `localStorage`, com fallback para a preferência do sistema operacional (`prefers-color-scheme: dark`) na primeira visita.

```ts
// useDarkMode.ts — portado 1:1 do wz-agente, independe da versão do Tailwind
const [dark, setDark] = useState(() => {
  const stored = localStorage.getItem("darkMode");
  if (stored !== null) return stored === "true";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
});
```

No Tailwind 4, a variante `dark:` precisa ser declarada explicitamente no CSS de tema (`@custom-variant dark (&:where(.dark, .dark *))`), já que o modelo `darkMode: "class"` do config JS não existe mais.

## 7. Iconografia: emoji, não biblioteca

O wz-agente usa **emojis Unicode diretos no JSX** (`📊`, `🖥`, `⚙️`, `🔔`) — não há nenhuma biblioteca de ícones (lucide, heroicons, etc.) instalada. **Mantemos essa escolha deliberadamente** no `wz-connect`, para não introduzir uma dependência visual nova e não fragmentar o padrão do hub. Se um dev sentir falta de um "ícone melhor", a resposta é: use um emoji, é o padrão do hub.

## 8. Anatomia dos componentes-padrão (`@wz/ui`)

### Button
- **Primary:** `bg-primary text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors`
- **Secondary:** `border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 py-2 px-4 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`
- **Danger:** `bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors`
- **Ghost:** sem fundo, `text-slate-400 hover:text-white` (usado em ações discretas dentro da sidebar/rodapé)

### Card
`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm`, com `hover:shadow-md transition-shadow` quando o card é interativo/clicável.

### Badge
Pill com dot indicator: `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium` + par de cor conforme a variante semântica (ver §3) + `<span className="h-1.5 w-1.5 rounded-full {dotColor}" />`.

### Modal
`fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4` (backdrop, fecha ao clicar fora) envolvendo `bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6` (o painel, `stopPropagation` no clique). Variante de confirmação traz ícone grande (`⚠️` para `danger`, `❓` para neutro) + título + mensagem + par de botões (Cancelar secundário / Confirmar primary ou danger).

### Spinner
`h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin`, centralizado em `flex justify-center p-12` quando usado como estado de carregamento de página inteira.

### Toast
Container fixo `fixed bottom-4 right-4 z-50 space-y-2`, toasts individuais `rounded-xl shadow-lg px-4 py-3 max-w-sm` com cor de fundo sólida por tipo (sucesso `bg-green-600`, erro `bg-red-600`, alerta `bg-orange-600`, neutro `bg-slate-700`), auto-dismiss em 5s com fade. **Diferença da versão portada:** o wz-agente injeta o toast via manipulação direta do DOM (`document.createElement`); em `@wz/ui`, isso vira um componente React idiomático (`ToastProvider` + `useToast()` hook com Context), mantendo exatamente a mesma aparência final.

### Input / Label
Input: `w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-slate-700 dark:text-slate-100`. Label: `block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1`.

### AppShell (generalização do `Layout.tsx`)
Sidebar fixa escura (`w-56 bg-slate-800 text-white`) com: cabeçalho (marca + busca opcional), navegação em seções (label uppercase tracking-widest + lista de links, ativo destacado com `bg-slate-600`), rodapé (usuário atual, toggle de dark mode, notificações, links de conta/logout). Diferente do original (que hardcoda o menu do DLP), `AppShell` recebe a lista de seções/links como prop — cada produto (incluindo os dois modos do wz-connect, Hub Admin e Org Admin) define seu próprio menu sem duplicar o componente de shell.

### Dropdown flutuante (notificações, menus de contexto)
`absolute right-0 top-10 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50`, cabeçalho com título + botão fechar, lista com itens `px-4 py-3 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700`.

## 9. Onde o `@wz/ui` mora e como é consumido

Pacote `packages/ui` no monorepo do `wz-connect`, publicado como `@wz/ui` (workspace local por enquanto). Cada app consome via `workspace:*` e importa:

```ts
import { Button, Card, Badge, Modal, Spinner, useToast, AppShell } from "@wz/ui";
```

```css
/* CSS de entrada de cada app */
@import "tailwindcss";
@import "@wz/ui/theme.css";
```

Ver ADR (a ser adicionada, se o time achar necessário formalizar) e o plano de divisão do MVP (`feature/auth-tenancy-core` e `feature/billing-plans-catalog`) para a regra de convivência: **`packages/ui` é tratado como somente-leitura por ambas as frentes** durante o desenvolvimento paralelo — mudanças nele acontecem em PR próprio contra `develop`, nunca dentro de uma branch de feature isolada.
