# Pendências para wz-agente

> **Regra:** Nada aqui é aplicado enquanto o `wz-connect` não existir e estar pronto para emitir tokens/SDK consumível. Este arquivo é só registro para não perder nada da discussão.
>
> **wz-agente é o projeto mais maduro do hub.** Tem 14 ADRs publicadas, 135 testes, MFA TOTP, agente Go para Windows, mTLS para agentes, docker-compose próprio. Tudo isso é **referência obrigatória** ao desenhar o Connect — não reinventar.

---

## Snapshot rápido do wz-agente (somente leitura, baseado no CLAUDE.md)

- Repositório: https://github.com/kienzley2003-ops/wz-agente
- Stack: **pnpm monorepo** (alinhado com wz-masterfila/wz-connect). Único projeto com **componente Go** (`apps/agent`).
- Backend: Fastify 5 + TypeScript, **bcriptjs** (não nativo), MFA TOTP pure Node.js (RFC 6238), 8 endpoints públicos, 60+ autenticados.
- Frontend: React 18 + Vite + Tailwind + Recharts + TanStack Query.
- E2E: Playwright.
- Auth atual: **JWT 15min em cookie httpOnly + refresh token opaco com rotação 7 dias + CSRF double-submit + MFA TOTP opcional + account lockout 5 falhas/30min** (ADR 005). Padrão mais robusto do hub.
- Multi-tenant: sim, `organization_id` em todas as tabelas. Tabela `users` própria.
- Agentes: **mTLS** (CA interna assina CSR ECDSA P-256) — onboarding com token único + re-attach por hardware fingerprint (SMBIOS UUID).
- Background jobs próprios: quarentena (60s), retention 90 dias, webhook retry (30s).
- Portas: Nginx `:8091`/`8444`, Postgres `5432` (padrão!).
- ADRs publicadas: 001–014. Cobertura ≥85% por workspace (Vitest + `go test`).
- Comandos remotos 11+ tipos (force_logoff, isolate_network, block_usb_now, etc.) + WZ Tools (manutenção).

---

## Itens pendentes (identificados durante o design do wz-connect)

### 1. Auth/identidade migrada para Connect
- **Hoje:** wz-agente mantém `users` (com `user_mfa`, `login_attempts`, `api_tokens`), rotas `/auth/login`, `/auth/refresh`, `/mfa/*`, `/users`, `/users/me`, lockout, inactivity, MFA TOTP.
- **Depois:** Tudo isso vira responsabilidade do Connect. wz-agente passa a validar JWT Connect via SDK público.
- **Ações no wz-agente (futuro):**
  - Remover rotas `auth/*`, `mfa/*`, `users*` (substituídas pelo Connect).
  - Remover coluna `login_attempts` em `users` — fica no Connect.
  - **Decisão de produto:** Connect herda o padrão "access JWT curto + refresh opaco rotativo + CSRF" do wz-agente (ADR 005), pois é o mais bem desenhado do hub. MFA e lockout também.
  - wz-agente mantém apenas o **mTLS dos agentes** (isso é específico de wz-agente, não sai do projeto).

### 2. Tenancy: de `organization_id` próprio para tenancy via Connect
- **Hoje:** Tabelas já têm `organization_id`. JWT payload carrega `organizationId`.
- **Depois:** Mesmo conceito, mas o `organizationId` vem validado no JWT Connect.
- **Ações no wz-agente (futuro):**
  - Trocar validação local de JWT auth por `connect.auth.guard()`.
  - Manter `organizations` como cache read-only do Connect (sync via webhook ou no login).
  - Garantir que toda query de domínio já filtra por `organization_id` (CLAUDE.md garante, mas auditar).

### 3. Catálogo de produtos
- **Hoje:** wz-agente não tem conceito de produto — é o único produto do seu contexto.
- **Depois:** JWT Connect carrega `products[]`. wz-agente precisa do produto `agent` (ou `dlp` — decidir) ativo.
- **Ações no wz-agente (futuro):**
  - Middleware `requireProduct('agent')` baseado em `req.user.products`.

### 4. Agentes: mTLS continua local (não sai do wz-agente)
- **Decisão importante:** mTLS dos agentes Windows **permanece no wz-agente**. Ele é específico desse projeto (DLP, rede de terceiro, modelo de ameaça diferente). Connect trata só de **identidade humana**.
- **Ações no wz-agente (futuro):**
  - Nenhuma — wz-agente continua emitindo seus próprios certs via CA interna.
  - **Excepcionalmente**, considerar no futuro se Connect deve virar a "CA raiz" do hub inteiro. Por ora, escopo fora do MVP.

### 5. Auditoria
- **Hoje:** wz-agente tem `audit_logs` próprio (org-scoped).
- **Depois:** Eventos sensíveis (login, troca de role, comando remoto emitido, revogação de cert) vão também para Connect via SDK.
- **Ações no wz-agente (futuro):**
  - Manter `audit_logs` local para queries rápidas do próprio wz-agente.
  - Adicionar `connect.audit.log(...)` em pontos sensíveis.

### 6. Billing & planos
- **Hoje:** wz-agente não tem cobrança — é o produto interno.
- **Depois:** Planos do Connect definem limites: `max_agents`, `max_events_per_month`, `max_api_tokens`, `max_users_admin`.
- **Ações no wz-agente (futuro):**
  - Middleware/SDK checa `connect.entitlements.check('agent', 'max_agents')` antes de aceitar novo enrollment.
  - UI wz-agente mostra plano/limites da org (read-only — gerenciamento fica no Connect).

### 7. Porta 5432 vs demais projetos
- **Hoje:** wz-agente usa Postgres `5432` (porta padrão).
- **Conflito:** wz-desk também usa `5432` (ver `wz-desk/docker/docker-compose.yml`).
- **Decisão a tomar:** wz-agente deveria mudar para outra porta (5435?) para evitar conflito quando o ambiente local roda wz-agente + wz-desk ao mesmo tempo. **Não é responsabilidade do Connect**, mas registrar aqui.

### 8. SDK publicável
- **Hoje:** wz-masterfila consome `@wz/connect-sdk` via tarball vendor.
- **Depois:** SDK vira workspace do wz-connect. wz-agente também consome via `workspace:*` (se monorepo conjunto) ou `npm:` (se cada projeto publica/consome independentemente).

### 9. Lições do wz-agente que o Connect deve herdar (e não reinventar)

| Item | wz-agente (ADR) | Connect deve |
|---|---|---|
| Hash de senha | `bcryptjs` puro JS (CLAUDE.md alerta) | igual |
| MFA | TOTP pure Node.js (RFC 6238) | igual |
| Auth | Access JWT 15min + refresh opaco rotativo + CSRF double-submit (ADR 005) | igual |
| Lockout | 5 falhas / 30min (ADR 005) | até igual — wz-masterfila usa 15min |
| Refresh token | rotação a cada uso (ADR 005) | igual |
| Rate limit | `@fastify/rate-limit` global 120/min, login 10/5min, enroll 5/10min | padrão wz-hub |
| Idempotência | implícita via webhook retry (backoff 1s→30s→5min→30min→2h) | webhook do Stripe igual |

### 10. Não-pendentes (não serão tocados)
- Toda a Stack DLP Win32 (clipboard/USB/print/network), Policy Engine, gestão de frota, WZ Tools, auto-update do agente, overlay de desktop — **permanece 100% no wz-agente**.
- ADRs 001–014 permanecem como referência.
- Componente Go (`apps/agent`) — **intocado**.
- Tabelas DLP (`dlp_events`, `agent_commands`, `dlp_policies`, etc.) — **intocadas**.

---

## Histórico

- **(2026-08-05)** wz-agente adicionado ao diretório wz-hub pelo usuário. Não estava no meu contexto inicial. Criado este arquivo como registro de pendências.
- **(2026-08-05)** wz-agente é o projeto **mais maduro** do hub. Sua ADR 005 (auth strategy) é referência obrigatória para o design do Connect. Todo o desenho de auth do Connect deve herdar esse padrão — não reinventar.