# wz-connect — Documento Vivo de Produto

> **Status:** Em discussão / discovery. Nenhum código será escrito até este documento (e os ADRs derivados) serem aprovados.
>
> **Regra do workspace:** Este é o único sistema em desenvolvimento agora. Toda mudança/dependência identificada para `wz-masterfila` ou `wz-desk` é registrada nos arquivos `wz-masterfila.md` e `wz-desk.md` na raiz, **sem aplicar nada** nesses sistemas.

---

## 1. Papel do wz-connect no ecossistema wz-hub

`wz-connect` é o **sistema de Auth + Tenancy + Billing-Light + Catálogo** do wz-hub. Ele é o único ponto de verdade para:

- Identidade de usuários (login, sessões, MFA, lockout)
- Identidade de organizações/empresas (multi-tenant root)
- Vínculo usuário ↔ organização (papéis/roles por organização)
- Catálogo de produtos do hub (quais ferramentas cada cliente tem acesso)
- Planos comerciais (free / pro / enterprise) e limites por plano
- Emissão de JWTs consumidos por `wz-desk`, `wz-masterfila` e demais módulos do hub
- Auditoria central de ações sensíveis

Os demais sistemas (`wz-masterfila`, `wz-desk`, `wz-orc`, futuros) **não mantêm usuários nem tenants próprios** — eles consomem Connect via SDK e delegam toda decisão de "quem é você, em qual empresa, com quais permissões, em qual plano" ao Connect.

**Estado atual dos consumidores (2026-08-05):**

| Sistema | Auth hoje | Tenancy hoje | SDK Connect | Maturidade |
|---|---|---|---|---|
| `wz-masterfila` | próprio (JWT + lockout + sessão única) | multi-tenant via `organizacao_id` + vault local | consome `@wz/connect-sdk` via tarball vendor | interno, em dev |
| `wz-desk` | valida JWT Connect (HS256, mesmo `JWT_SECRET`) | single-tenant-ready via `companyId` | ainda não consome (dependência futura) | interno, em dev |
| `wz-orc` | senha única `WZ_ORC_SENHA` (ADR 0014) | single-tenant funcional, `organizacao_id` em toda tabela | ainda não consome (SSO já previsto ADR 0007) | **produção v0.1.0** |
| `wz-agente` | JWT 15min + refresh opaco rotativo + CSRF + MFA TOTP + lockout (ADR 005) | multi-tenant via `organization_id` próprio | ainda não consome | **mais maduro** (14 ADRs, 135 testes, agente Go) |

**wz-agente é o projeto de referência** para decisões de auth. Seu ADR 005 já resolveu metade das questões que tínhamos em aberto. Toda decisão de auth do Connect deve herdar o padrão wz-agente — não reinventar.

Detalhamento por sistema e lista de pendências específicas:

- `wz-masterfila-pendencias.md` (na raiz)
- `wz-desk-pendencias.md` (na raiz)
- `wz-orc-pendencias.md` (na raiz)
- `wz-agente-pendencias.md` (na raiz)

---

## 2. Conceitos de Domínio (proposta inicial)

| Conceito | Descrição |
|---|---|
| **Organization** | Empresa/cliente do hub. Root do tenancy. Todo recurso pertence a uma org. |
| **User** | Conta global de pessoa. Pode pertencer a N organizations. |
| **Membership** | Vínculo `User ↔ Organization` com `role` (owner, admin, manager, operator, viewer) e `status` (active, invited, suspended). |
| **Product** | Ferramenta do hub que pode ser habilitada para uma org (ex.: `masterfila`, `desk`, futuras). |
| **Plan** | Conjunto de produtos + limites (qtd. de usuários, qtd. de tickets/mês, qtd. de painéis, etc.). |
| **Subscription** | Vínculo `Organization ↔ Plan` com `status` (trialing, active, past_due, canceled) e datas de ciclo. |
| **Entitlement** | Resolve em runtime: "esta org tem o produto X ativo neste momento?" |
| **Session** | Sessão autenticada de um user. Single-session enforcement (já padrão no masterfila). |
| **AuditEvent** | Log imutável de ações sensíveis (login, troca de plano, convite aceito, etc.). |

---

## 3. Responsabilidades funcionais

### 3.1 Autenticação

- Login email + senha
- Argon2id para hash
- JWT HS256 (curto) + refresh token (longo) ou estratégia de sessão única (a definir — ver ADR pendente)
- Lockout após N tentativas (5 → 15 min, mesmo padrão do masterfila)
- Recuperação de senha via e-mail (magic link)
- Convite de usuário via e-mail (aceite cria vínculo Membership)
- MFA opcional (TOTP) — *fase 2*
- Inactivity logout (client-side em cada módulo, server-side por heartbeat — ver §6)

### 3.2 Tenancy

- Toda tabela de domínio carrega `organization_id`
- JWT payload carrega `orgId`, `membershipId`, `roles[]`, `planId`
- Toda query nos módulos downstream filtra por `orgId` do token
- Subdomain resolver: `acme.wz-hub.com` → org `acme` (mesma estratégia do `TENANT_VAULT` do masterfila — porém a vault passa a ser responsabilidade do Connect)

### 3.3 Planos & Catálogo

- Admin do hub (super-admin) gerencia `Plans` e `Products`
- Owner da org gerencia `Subscription` (upgrade/downgrade/cancel)
- Cada `Plan` declara:
  - Lista de `Product`s incluídos
  - Limites numéricos (ex.: `max_users`, `max_monthly_tickets`, `max_paineis`)
- Entitlements são checados por produto, não por plano direto (separa "o que está no plano" de "está ativo agora")

### 3.4 Autorização (RBAC)

Papéis por membership (proposta inicial, refinar):

| Role | Pode |
|---|---|
| `owner` | Tudo na org + billing + convidar owner |
| `admin` | Tudo na org exceto billing |
| `manager` | Gerenciar usuários e configurações dos produtos |
| `operator` | Usar os produtos do dia-a-dia |
| `viewer` | Apenas leitura |

Permissões são resolvidas em **dois lugares**:
1. **Connect** — autorizações *globais* da org (quem pode convidar, quem pode mudar plano)
2. **Cada módulo** — autorizações *dentro do produto* (ex.: no masterfila, quem pode criar guichês). Connect só garante que o user tem o produto habilitado; o módulo decide o que ele faz dentro dele.

### 3.5 Auditoria

- Tabela `audit_events` append-only
- Eventos emitidos por Connect **e** pelos módulos (via SDK) com `actorId`, `orgId`, `product`, `action`, `target`, `ip`, `ua`
- API `GET /audit-events` com filtros (data, actor, product, action)

### 3.6 Billing (escopo a definir)

- **Mínimo viável:** Connect sabe o plano e os limites; cobrança real (Stripe/etc.) é integração externa.
- **Fase 2:** Webhooks de pagamento, faturas, dunning.
- Decidir agora se já modelamos `invoices`/`payments` ou só `subscriptions` + flags.

---

## 4. Stack proposta

> Stack padrão wz-hub (alinhada com wz-masterfila):

- **Backend:** Node.js 20 LTS, Fastify 5.x, Drizzle ORM, PostgreSQL 16
- **Frontend:** React 19 + Vite 6 + Tailwind 4 (admin do hub e painel da org)
- **Auth:** `@fastify/jwt` (HS256), Argon2id
- **Validação:** Zod
- **Docs:** `@fastify/swagger` + `@fastify/swagger-ui` em `/api/v1/docs`
- **Rate limit:** `@fastify/rate-limit` (global + `/auth/login` 10/min)
- **E-mail:** SMTP via nodemailer (provedor TBD)
- **Testes:** Vitest 2.x, ≥85% cobertura em módulos unit-testáveis (mesma política do masterfila)
- **Layout:** pnpm monorepo — `apps/backend`, `apps/frontend`, `packages/shared`, `packages/connect-sdk` (substitui o tarball vendor do masterfila)

---

## 5. Layout de repositório (proposta)

```
wz-connect/
├── apps/
│   ├── backend/                 # API Fastify
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── env.ts
│   │   │   ├── routes/          # auth, orgs, users, memberships, plans, products, subscriptions, audit
│   │   │   ├── services/        # auth, membership, entitlement, audit, email, billing
│   │   │   ├── db/              # schema + migrations Drizzle
│   │   │   ├── tenancy/         # subdomain resolver + tenant context middleware
│   │   │   ├── connect/         # emissão/validação de tokens para o hub
│   │   │   └── lib/             # puros (ex.: permission resolver, entitlement checker)
│   │   └── __tests__/
│   └── frontend/                # Admin do hub + painel da org
│       └── src/pages/{HubAdmin, OrgDashboard, Users, Plans, Billing, Audit, Login}
├── packages/
│   ├── shared/                  # tipos: Organization, User, Membership, Plan, JWT, etc.
│   └── connect-sdk/             # SDK público consumido por wz-desk, wz-masterfila, etc.
├── docs/adr/                    # ADRs do Connect
├── docker-compose.yml
├── nginx/                       # se necessário
├── package.json (root, pnpm workspaces)
└── pnpm-workspace.yaml
```

**Diferença-chave em relação ao masterfila:** o SDK passa a ser **publicável** (workspace local por enquanto, npm registry no futuro), em vez de tarball vendor.

---

## 6. Integração com wz-masterfila e wz-desk

### 6.1 Modelo de token

JWT Connect (esboço do payload):

```json
{
  "iss": "wz-connect",
  "sub": "<userId>",
  "org": "<organizationId>",
  "membership": "<membershipId>",
  "roles": ["admin"],
  "plan": "<planId>",
  "products": ["masterfila", "desk"],
  "session": "<sessionId>",
  "iat": ...,
  "exp": ...
}
```

- `products[]` permite checagem de entitlement sem chamada extra ao Connect
- `session` habilita single-session enforcement
- Módulos validam o token localmente (HS256 com `JWT_SECRET` compartilhado) **e** fazem checagem de entitlement contra o SDK em chamadas sensíveis

### 6.2 Endpoints públicos do Connect (consumidos pelos módulos)

| Método | Rota | Quem chama |
|---|---|---|
| `POST /auth/login` | login | UI de cada módulo |
| `POST /auth/refresh` | refresh token | módulos |
| `GET  /auth/me` | user + memberships | módulos |
| `POST /auth/logout` | encerra sessão | módulos |
| `POST /auth/sessions/:id/heartbeat` | keep-alive | módulos |
| `POST /auth/sessions/:id/encerrar-beacon` | tab-close | módulos |
| `GET  /orgs/:id/entitlements` | quais produtos ativos | módulos, na inicialização |
| `POST /audit` | módulos registram ações sensíveis | módulos |
| `POST /webhooks/billing` | (fase 2) Stripe/etc | provider externo |

### 6.3 O que muda nos módulos (registrado em `wz-masterfila.md` e `wz-desk.md`)

Pendências já identificadas — **sem aplicar ainda**:

- `wz-masterfila`: substituir `TENANT_VAULT` local por chamada ao Connect; remover `connect-sdk` vendor e consumir `@wz/connect-sdk` publicável; ajustar `JWT payload` para incluir `products[]` e `plan`.
- `wz-desk`: trocar validação local de JWT por validação via `@wz/connect-sdk`; trocar `companyId` no schema por `organizationId` (alinhamento de naming).
- `wz-orc` (v0.1.0, ADR 0014): substituir auth por senha única (`WZ_ORC_SENHA`) por SSO via Connect; remover `organizacaoAtual()` próprio; checar entitlement do produto `orc` no token. SSO já previsto na ADR 0007.
- Todos: substituir rotas próprias de `usuarios`/`auth` por chamadas ao Connect; o admin dos módulos passa a ser o Connect (ou um proxy).

---

## 7. Perguntas em aberto (a decidir antes de codar)

> **Legenda:** ✅ = resolvido / decidido. 🔄 = em discussão ou aguardando você. ⏳ = respondida em texto, será marcada ✅ após validação na §8.

| # | Pergunta | Status | Resposta / proposta |
|---|---|---|---|
| 1 | Refresh tokens ou sessão única? | ✅ Herdado | Access JWT 15min + refresh opaco rotativo 7 dias + CSRF double-submit. Refresh rotaciona a cada uso. |
| 2 | MFA no MVP? | ✅ Herdado | Sim, TOTP pure Node.js RFC 6238. Opcional por user, obrigatório para `owner` da org e `super_admin` do hub. |
| 3 | Billing real no MVP? | ✅ Decidido | **Stripe** desde o dia 1. Webhook obrigatório. |
| 4 | Super-admin do hub em banco separado? | ✅ Decidido | **Mesmo banco**, role global `super_admin` (sem `organizationId`). |
| 5 | Resolução de tenant por subdomínio 100% no Connect? | ✅ Decidido | **Sim, 100% no Connect.** Subdomínio é o caminho principal; `BASE_DOMAIN` legado dos módulos continua existindo só por compatibilidade transitória. |
| 6 | Catálogo de produtos dinâmico ou hardcoded? | ✅ Decidido | **Dinâmico em banco**, com seed inicial. Justificativa: teremos vários outros serviços depois. |
| 7 | Rate limit global ou por org? | ✅ Decidido | **Global** no MVP (200/min global + 10/min em `/auth/login`). Override por plano fica para v1.1. |
| 8 | Auditoria direta ou via evento? | ✅ Herdado | **Direto** via SDK. |
| 9 | Plano Free existe? | ✅ Decidido | **Sim, com limites apertados**: 1 usuário, 100 tickets/mês, 50 orçamentos/mês, 1 agente. (valores calibráveis via seed) |
| 10 | Trial? | ✅ Decidido | **14 dias com cartão**. Stripe gerencia. |
| 11 | Downgrade imediato ou agendado? | ✅ Decidido | **Agendado para fim do ciclo**. |
| 12 | Nota fiscal BR? | ✅ Decidido | **Sim, desde o dia 1.** Integração com **NFe.io**. Emitida **após cada invoice paga** do Stripe. Job assíncrono no worker, plug já preparado para também ser exposto como endpoint interno (v1.1: admin faz refund direto da UI do Connect, sem precisar abrir Stripe Dashboard). |
| 13 | Multi-moeda? | ✅ Decidido | **Só BRL no MVP**, sem multi-moeda. |
| 14 | Worker é app separado? | ✅ Decidido | **Sim** (BullMQ + Redis), wz-agente já tem padrão similar. |
| 15 | Worker e backend compartilham DB? | 🔄 **Em discussão** | Ver §7.1 abaixo — precisa da sua escolha. |
| 16 | Lockout duration | ✅ Herdado | **5 falhas / 30min**. |
| 17 | Hash de senha | ✅ Herdado | **bcryptjs puro JS**. |
| 18 | CSRF strategy | ✅ Herdado | **Double-submit cookie**. |
| 19 | Hub Admin: dashboard global no MVP? | ✅ Decidido | **Sim, dashboard global completo.** Ninguém gosta de tela simples. |
| 20 | Org Admin: gráfico de uso vs limites no MVP? | ✅ Decidido | **MVP pode ser o mais simples (plano + próxima cobrança)**, mas deixar **plugs prontos** para v1.1 já expor consumo na tela de assinatura. |
| 21 | Onboarding wizard: 5 passos são suficientes? | ✅ Decidido | **Sim, quanto mais simples melhor a conversão.** Restante se coleta depois (segmento, tamanho da empresa, telefone) em pesquisa opcional após onboarding, nunca como bloqueante. |
| 22 | Master pode impersonar org? | ✅ Decidido | **Sim**, com flag visual gigante "você está impersonando X" + toda ação registrada em auditoria com `impersonatedBy`. |
| 23 | Feature flags por org? | ✅ Decidido | **Sim, no MVP**, tabela `feature_flags` simples. |
| 24 | TLS em dev? | ✅ Decidido | **HTTP puro em local**, **HTTPS (Caddy + cert auto-assinado) só em homologação/produção**. |
| 25 | Backup do Postgres? | ✅ Decidido | **pg_dump diário** (retenção 30 dias) + snapshot antes de migrations destrutivas. |
| 26 | Observabilidade? | ✅ Decidido | **Pino (logs) + OpenTelemetry tracing desde o dia 1**. |
| 27 | CDN? | ✅ Decidido | **Cloudflare**. |
| 28 | Hospedagem? | ✅ Decidido | **Self-hosted** (Docker no VPS do usuário). |
| 29 | Multi-moeda? | ✅ Decidido | **Não.** Só BRL. |
| 30 | Estorno/refund pelo Connect ou Stripe Dashboard? | ✅ Decidido | **MVP: admin faz no Stripe Dashboard.** Mas **plug já fica preparado** para v1.1: endpoint Connect com permissão de refund Stripe + UI interna. |

### 7.1 Worker: compartilhar DB com backend ou separar?

**Argumentos a favor de compartilhar DB (mesmo Postgres, tabelas separadas por schema):**

- ✅ Mais simples de operar (1 backup, 1 monitoramento, 1 connection pool)
- ✅ Transações entre worker e backend funcionam nativamente (join entre `worker_*` e `core_*`)
- ✅ Custo: 1 Postgres só (Cloud Postgres cobra por instância)
- ✅ wz-agente já faz assim (background jobs no mesmo banco)
- ❌ Se um job mal escrito segurar lock pesado, pode atrasar o backend

**Argumentos a favor de separar (2 databases):**

- ✅ Isolamento total: bug no worker não toca o backend
- ✅ Pode escalar o worker independentemente (read replicas dedicadas)
- ✅ Permite migrar worker para Postgres separado no futuro sem mudar app (mesma lib)
- ❌ Custo: 2× (Cloud Postgres é o item mais caro na AWS/Railway; self-hosted dobra RAM/disk)
- ❌ Sem FK cross-database — tabelas compartilhadas (audit, idempotency keys) viram duplicação ou HTTP interno
- ❌ Mais um Postgres pra monitorar, fazer backup, atualizar

**Minha sugestão: compartilhar DB** com tabelas do worker em schema separado (`worker_*`). É o caminho mais simples, o wz-agente já usa, e a separação por schema dá o isolamento lógico que 95% dos casos precisa. Se precisar separar físico depois, migração é viável porque tabelas do worker são poucas e bem definidas.

**Custos estimados (self-hosted, mesma máquina):**

- Compartilhar: 1 Postgres, +0% no custo de infra
- Separar: 2 Postgres, ~+30–50% no custo de infra (mais RAM, mais disco, mais backup)

**Qual você prefere?** (Se aceitar minha sugestão, responda "compartilhar" e seguimos.)

---

## 8. Próximos passos sugeridos

1. ~~Responder as perguntas acima~~ ✅ Quase tudo decidido (só falta #15 sobre worker/DB compartilhado)
2. Definir o **MVP** (corte de funcionalidades)
3. Gerar ADRs:
   - ADR-001: Stack Fastify + Drizzle + Postgres
   - ADR-002: pnpm monorepo com SDK como workspace
   - ADR-003: Modelo de tenancy (subdomain resolver + JWT)
   - ADR-004: Entitlements (products[] no token + checagem via SDK)
   - ADR-005: Planos & limites (modelo de dados)
   - ADR-006: Single-session enforcement
   - ADR-007: Auditoria central
   - ADR-008: Billing Stripe + webhook
   - ADR-009: NF-e via NFe.io (job assíncrono)
   - ADR-010: Worker compartilhando DB com backend (decisão pendente)
   - ADR-011: Defensência em camadas
   - ADR-012: Observabilidade Pino + OTEL
4. Modelar schema Drizzle das tabelas core
5. Só então começar o código

---

## Histórico de decisões

> Anotar aqui, em ordem cronológica, cada decisão tomada para não perder o contexto da discussão.

- **(2026-08-05)** Decidido: wz-connect será o sistema **Auth + Tenancy + Catálogo/Planos** do wz-hub; demais sistemas consomem via SDK.
- **(2026-08-05)** Decidido: layout **pnpm monorepo** (apps/backend + apps/frontend + packages/shared + packages/connect-sdk).
- **(2026-08-05)** wz-orc entrou no diretório wz-hub (`v0.1.0`, single-tenant, senha única). Registrado em `wz-orc-pendencias.md`.
- **(2026-08-05)** **wz-agente entrou no diretório wz-hub.** É o projeto mais maduro (14 ADRs, 135 testes, agente Go para Windows). Seu ADR 005 serve de **referência obrigatória** para decisões de auth no Connect. Decisões herdadas:
  - Auth = access JWT 15min + refresh opaco rotativo 7 dias + CSRF double-submit
  - MFA TOTP pure Node.js (RFC 6238), opcional por user
  - Lockout 5 falhas / 30min
  - Hash de senha = bcryptjs puro JS
  - Auditoria direta via SDK
  - mTLS dos agentes Windows **permanece no wz-agente** (específico, não sai do projeto)
- **(2026-08-05)** Consolidação das decisões de produto do usuário (NF-e desde o dia 1 via NFe.io, BRL only, self-hosted, Cloudflare, Pino + OTEL, dashboard global no MVP, etc.). 28/30 decisões fechadas; resta apenas #15 (worker compartilhar DB com backend ou separar). Análise completa em §7 e §7.1.