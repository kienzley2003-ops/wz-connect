# Pendências para wz-masterfila

> **Regra:** Nada aqui é aplicado enquanto o `wz-connect` não estiver pronto e estável. Este arquivo é só registro para não perder nada da discussão.

---

## Itens pendentes (identificados durante o design do wz-connect)

### 1. Substituir tenancy local por tenancy via Connect
- **Hoje:** `wz-masterfila/apps/backend/src/tenancy/` mantém `TENANT_VAULT` (JSON de `{subdomain: {host, port, database, user, password}}`) e `BASE_DOMAIN` em `env.ts`.
- **Depois:** `wz-masterfila` deixará de resolver tenant por subdomínio. A resolução passa a ser responsabilidade do `wz-connect`; o masterfila recebe `organizationId` já validado no JWT.
- **Ações no masterfila (futuro):**
  - Remover `apps/backend/src/tenancy/` (`vault.ts`, `vault-resolver.ts`, `create-tenancy.ts`, `connection.ts`) e seus testes (`vault.test.ts`, `vault-resolver.test.ts`).
  - Remover `TENANT_VAULT` e `BASE_DOMAIN` do `env.ts`.
  - Ajustar bootstrap para extrair `organizationId` do JWT em vez de do host.

### 2. Substituir SDK vendor por SDK publicável
- **Hoje:** `@wz/connect-sdk` instalado via `file:../../vendor/wz-connect-sdk-0.2.0.tgz` em `apps/backend/package.json`.
- **Depois:** SDK passa a ser workspace `@wz/connect-sdk` publicado pelo `wz-connect/packages/connect-sdk`.
- **Ações no masterfila (futuro):**
  - Trocar `file:../../vendor/...` por `workspace:*` em `apps/backend/package.json`.
  - Remover `vendor/wz-connect-sdk-0.2.0.tgz`.
  - Atualizar imports se a API do SDK evoluir.

### 3. Atualizar JWT payload esperado
- **Hoje:** MasterFila espera `{ sub, organizacaoId, sessaoId, roles, ... }` (ver `wz-masterfila/CLAUDE.md` §Auth & Security).
- **Depois:** Connect emite `{ sub, org, membership, roles, plan, products[], session, ... }`. Campos `org` e `products[]` serão novos.
- **Ações no masterfila (futuro):**
  - Atualizar tipo `JwtPayload` em `apps/backend/src/types/`.
  - Atualizar estratégia JWT para ler `org` (e manter compat com `organizacaoId` por um período).
  - Adicionar checagem de entitlement: "este token tem o produto `masterfila` ativo?" antes de permitir acesso.
  - Atualizar frontend (`apps/frontend/src/lib/auth.ts`) para refletir o novo payload.

### 4. Migrations
- **Hoje:** `apps/backend/drizzle/` tem 14 migrations (0000–0013) — ver `wz-masterfila/CLAUDE.md` §Database Migrations.
- **Depois:** Nenhuma migration de tenancy será necessária, pois tenancy sai do masterfila. Migrations existentes permanecem; nenhuma nova é esperada por causa do Connect.

### 5. Usuários / Auth próprio
- **Hoje:** MasterFila mantém `usuarios` (com `tentativas_login`, `bloqueado_ate`, `sessao_ativa_id`), rotas `/auth/login`, `/auth/me`, `/usuarios`, lockout e inactivity logout.
- **Depois:** Tudo isso migra para o Connect.
- **Ações no masterfila (futuro):**
  - Remover rotas `auth/*` e `usuarios/*`.
  - Remover `tentativas_login`, `bloqueado_ate` da tabela `usuarios`.
  - Remover lockout local — passa a ser responsabilidade do Connect.
  - Substituir `useInactivityLogout` local pelo client SDK (`@wz/connect-sdk/client`).

### 6. Auditoria
- **Hoje:** `auditoria` table + `audit.service.ts` + rota `/auditoria` (admin).
- **Depois:** Auditoria local pode permanecer (logs específicos do masterfila) **e** eventos sensíveis passam a ser enviados ao Connect via SDK (`POST /audit`).
- **Ações no masterfila (futuro):**
  - Manter `audit.service.ts` para logs locais.
  - Adicionar chamadas a `connect.audit.log(...)` em pontos sensíveis (criação de guichê, mudança de plano, etc.).

### 7. Catálogo de produtos
- **Hoje:** Não existe — masterfila é um único produto, sem conceito de "outros produtos na mesma org".
- **Depois:** O JWT carrega `products[]`. MasterFila precisa garantir que o produto `masterfila` está na lista antes de aceitar requisições; senão, redirecionar o user ao Connect para upgrade.
- **Ações no masterfila (futuro):**
  - Middleware `requireProduct('masterfila')` baseado em `req.user.products`.

### 8. Frontend — single-page vs multi-product
- **Hoje:** MasterFila tem páginas próprias de login, admin, configs.
- **Depois:** Decidir se o admin do masterfila migra para o admin do Connect (uma única UI de hub) ou se cada produto mantém sua própria UI. **Decisão em aberto — depende do escopo de UI do Connect.**

### 9. nginx / docker-compose
- **Hoje:** `nginx/nginx.conf` faz proxy para `backend:3000` (porta do masterfila).
- **Depois:** Provavelmente o Connect assume a porta 3000 e o masterfila muda para 3100 (já alinhado com `.claude/launch.json`).
- **Ações no masterfila (futuro):**
  - Ajustar `docker-compose.yml` e `nginx.conf` para apontar para a porta nova do masterfila.

---

## Itens NÃO pendentes (não serão tocados)

- Toda a lógica de fila, tickets, estado, round-robin, sessão de caixa, painel, etc. — **permanece 100% no masterfila**.
- Migrations 0000–0013 permanecem como estão.
- Frontend (totem/caixa/painel/fila) permanece no masterfila.

---

## Histórico

- **(2026-08-05)** Criado este arquivo como registro de pendências. Nenhuma alteração aplicada ao masterfila.