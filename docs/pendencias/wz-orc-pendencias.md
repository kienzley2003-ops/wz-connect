# Pendências para wz-orc

> **Regra:** Nada aqui é aplicado enquanto o `wz-connect` não existir e estar pronto para emitir tokens/SDK consumível. Este arquivo é só registro para não perder nada da discussão.

> Não havia `wz-orc` no meu contexto inicial — só soube da existência quando você clonou. Este arquivo captura o que descobri no `CLAUDE.md` e nos ADRs do projeto sem tocar em nenhum arquivo dele.

---

## Snapshot rápido do wz-orc (somente leitura, baseado no CLAUDE.md)

- Repositório: https://github.com/kienzley2003-ops/wz-orc
- Branch atual: `main` (release `v0.1.0` — `d5ede43`)
- Stack: **npm workspaces** (NÃO pnpm). Monorepo com `shared/`, `backend/`, `frontend/`, `nginx/`. Diferente do wz-masterfila/wz-desk.
- Backend: Fastify 5 + Drizzle + Postgres + WebSocket (`/ws`). API sob `/api/v1`. Migrations 0000–0001.
- Frontend: React 19 + Vite + Tailwind 4.
- Auth atual: **senha única via `WZ_ORC_SENHA`** (cookie de sessão), definida na ADR 0014. Sem `usuarios` próprio.
- Tenancy: **single-tenant funcional**, mas **toda tabela de domínio carrega `organizacao_id`** (ADR 0007). Organização é resolvida só no servidor via `organizacoes.ts` — o client nunca envia `organizacao_id`.
- Portas no host (ADR 0003): Nginx **3001**, Postgres **5434** (3000/5432/5433 ocupados por wz-masterfila/wz-desk).
- ADRs publicadas: 0001–0018.
- Cobertura de testes: Vitest com mínimo 85% por workspace, gated por Husky/pre-push.
- Tudo roda em Docker. `docker compose up -d` sobe a stack completa.

---

## Itens pendentes (identificados durante o design do wz-connect)

### 1. SSO via WZ Connect (já previsto na ADR 0007)
- **Hoje:** Auth por senha única `WZ_ORC_SENHA`. ADR 0014 inclusive documenta que é "autenticação mínima" e o SSO via Connect é o destino natural.
- **Depois:** Substituir `WZ_ORC_SENHA` por validação de JWT emitido pelo `wz-connect` via SDK (`@wz/connect-sdk`).
- **Ações no wz-orc (futuro):**
  - Trocar middleware de `senha única` por guard baseado em `connect.auth.guard()`.
  - Manter compatibilidade por flag de ambiente (`WZ_ORC_AUTH_MODE=connect|single`) durante a transição.
  - Remover cookie de sessão próprio quando o `sessaoId` do JWT Connect for suficiente.

### 2. Substituir auth dedicada por tenancy via Connect
- **Hoje:** wz-orc é single-tenant funcional, mas com `organizacao_id` em toda tabela (preparação já feita — ADR 0007).
- **Depois:** wz-orc deixa de resolver organização no servidor via `organizacoes.ts` próprio; passa a receber `organizationId` validado pelo JWT Connect.
- **Ações no wz-orc (futuro):**
  - Trocar `organizacaoAtual()` por leitura de `req.user.org` (campo do JWT Connect).
  - Manter `organizacoes` como tabela **read-only** (cache do Connect), com sync via webhook ou no login.
  - Decidir se o `organizacao_id` continua existindo localmente como FK para `organizacoes` ou se vira só um `UUID` sem FK (puramente escopo de tenant vindo do token).

### 3. Adicionar checagem de entitlement
- **Hoje:** wz-orc não checa entitlement de produto — é o único produto do seu próprio contexto.
- **Depois:** JWT carrega `products[]`. wz-orc precisa do produto `orc` (ou nome equivalente — a definir no Connect) ativo.
- **Ações no wz-orc (futuro):**
  - Middleware `requireProduct('orc')` baseado em `req.user.products`.
  - UI: redirecionar para o Connect (tela de upgrade) quando o produto estiver ausente.

### 4. Catálogo de produtos e billing
- **Hoje:** Não há conceito de plano. wz-orc é um app único.
- **Depois:** Planos do wz-hub podem impor limites em wz-orc (ex.: `max_orcamentos_mes`, `max_usuarios`).
- **Ações no wz-orc (futuro):**
  - SDK expõe `connect.entitlements.check('orc', 'max_orcamentos_mes')` — wz-orc consome antes de criar orçamentos.
  - UI mostra plano/limites atuais da org.

### 5. Auditoria
- **Hoje:** wz-orc não tem tabela de auditoria própria.
- **Depois:** Eventos sensíveis (criação/edição/duplicação/cancelamento de orçamento, importações em massa) são enviados ao Connect via SDK.
- **Ações no wz-orc (futuro):**
  - `connect.audit.log({ action: 'orcamento.created', target, metadata })` em pontos sensíveis.
  - Eventos de importação (`/api/v1/moldes/:id/importar`) também auditados.

### 6. Migração do npm para pnpm (decisão em aberto)
- **Hoje:** wz-orc usa **npm workspaces** (lockfile `package-lock.json`, ADR 0008).
- **Padrão wz-hub:** wz-masterfila e wz-connect usarão **pnpm workspaces**.
- **Ações no wz-orc (futuro, se decidido padronizar):**
  - Migrar de npm para pnpm — risco de quebrar a CI atual. Sugiro manter npm até decisão formal; ADR 0008 vira histórico.
  - Alternativa: wz-orc continua com npm e coexistência é documentada no CLAUDE.md da raiz.

### 7. SDK publicável
- **Hoje:** wz-masterfila consome `@wz/connect-sdk` via tarball vendor (`wz-masterfila/vendor/wz-connect-sdk-0.2.0.tgz`).
- **Depois:** SDK passa a ser workspace do wz-connect, publicável. wz-orc também consome via `workspace:*` (se virar monorepo conjunto) ou `npm:` (se cada projeto publisha/consome independentemente).

### 8. Single-tenant → multi-tenant natural
- **Hoje:** wz-orc é single-tenant. `organizacao_id` carregado nas tabelas, mas só existe uma org cadastrada.
- **Depois:** wz-orc passa a atender N orgs, cada uma isolada por `organizacao_id` validado no JWT.
- **Ações no wz-orc (futuro):**
  - Confirmar que **toda query de domínio** já filtra por `organizacao_id` (CLAUDE.md §10 garante, mas precisa de auditoria de queries).
  - Catálogo e orçamentos: passarão a ser por org (multi-tenant já está preparando o terreno).

---

## Itens NÃO pendentes (não serão tocados)

- Estrutura de produtos, fornecedores, orçamentos, itens, markup — **permanece 100% no wz-orc**.
- ADRs 0001–0018 — permanecem como referência histórica.
- Stack Fastify + Drizzle + Vitest + Docker — mantida.
- Lockfile npm — mantido até decisão sobre padronização (§6).
- Migrations 0000–0001 e a estrutura de banco existente — mantidas.

---

## Histórico

- **(2026-08-05)** wz-orc apareceu no diretório raiz via `git clone` do usuário. Não estava no meu contexto inicial. Criado este arquivo como registro de pendências sem aplicar nenhuma mudança no projeto.
- **(2026-08-05)** Já em produção (`v0.1.0`, branch `main`). Auth própria é senha única (ADR 0014); SSO Connect já estava previsto na ADR 0007 como evolução futura.