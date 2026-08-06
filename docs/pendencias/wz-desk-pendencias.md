# Pendências para wz-desk

> **Regra:** Nada aqui é aplicado enquanto o `wz-connect` não estiver pronto e estável. Este arquivo é só registro para não perder nada da discussão.

---

## Itens pendentes (identificados durante o design do wz-connect)

### 1. Validação de JWT compartilhada
- **Hoje:** `wz-desk/src/core/auth/strategies/jwt.strategy.ts` valida HS256 com `JWT_SECRET` definido em `.env.example` — e o comentário no `.env.example` diz "use the same JWT secret as WZ Connect to validate tokens".
- **Depois:** Validação passa a ser feita via `@wz/connect-sdk` (workspace do Connect). Estratégia local é removida.
- **Ações no wz-desk (futuro):**
  - Remover `src/core/auth/strategies/jwt.strategy.ts`.
  - Adicionar `@wz/connect-sdk` como dependência.
  - Trocar `JwtAuthGuard` por um guard baseado em `connect.auth.guard()`.

### 2. Renomear `companyId` → `organizationId`
- **Hoje:** Schema Drizzle (`src/core/database/schema/tickets.schema.ts`, `assets.schema.ts`) e payload JWT (`{ sub, email, companyId, roles[] }`) usam `companyId`.
- **Depois:** Alinhar com o Connect: `organizationId` em tudo. Connect emite `org` no token, mas o wz-desk pode normalizar para `organizationId` internamente.
- **Ações no wz-desk (futuro):**
  - Migration de rename de coluna `company_id` → `organization_id`.
  - Atualizar tipo `JwtPayload`.
  - Atualizar `CurrentUser` decorator.

### 3. Auth próprio / gestão de usuários
- **Hoje:** wz-desk é só um módulo de tickets, sem `users` próprio, mas depende do `JWT_SECRET` do Connect para validar.
- **Depois:** wz-desk não terá rotas de auth. Tudo vem do Connect.
- **Ações no wz-desk (futuro):**
  - Garantir que nenhuma rota `auth/*` ou `users/*` exista localmente.
  - Remover `JwtModule.registerAsync` se for substituído por SDK.

### 4. Multi-tenancy por `companyId`
- **Hoje:** Tabelas já têm `company_id` e isso casa com a tenancy do Connect (que chamará de `organizationId`).
- **Depois:** Mesma tenancy, nome canônico `organization_id`. Filtros de query já são por `company_id` — basta renomear.
- **Ações no wz-desk (futuro):**
  - Migration de rename + atualizar todas as queries.

### 5. Catálogo de produtos
- **Hoje:** Não existe conceito de produto — wz-desk é um módulo solto.
- **Depois:** JWT carrega `products[]`. wz-desk precisa do produto `desk` ativo.
- **Ações no wz-desk (futuro):**
  - Middleware/guard `requireProduct('desk')` baseado em `req.user.products`.

### 6. Auditoria
- **Hoje:** Nenhuma auditoria própria.
- **Depois:** Eventos sensíveis (criação de ticket, comentários, mudança de status, anexos) são enviados ao Connect via SDK.
- **Ações no wz-desk (futuro):**
  - Adicionar `connect.audit.log(...)` em pontos sensíveis.

### 7. Configuração / Bootstrap
- **Hoje:** `src/main.ts` seta `app.setGlobalPrefix('api/v1')`, ValidationPipe, HttpExceptionFilter; Swagger em `/docs`.
- **Depois:** Manter — wz-desk continua expondo seus próprios recursos sob `/api/v1`. Apenas o auth muda.
- **Ações no wz-desk (futuro):**
  - Nenhuma mudança prevista além das listadas acima.

---

## Itens NÃO pendentes (não serão tocados)

- Estrutura de tickets, comentários, anexos, prioridades, status — **permanece 100% no wz-desk**.
- Stack NestJS + Drizzle + Fastify — mantida.
- Lockfile npm — mantido.
- Docker Compose do Postgres local — mantido.

---

## Histórico

- **(2026-08-05)** Criado este arquivo como registro de pendências. Nenhuma alteração aplicada ao wz-desk.