# ADR-011: Integração de produtos via `@wz/connect-sdk` (Adapter) — MasterFila como app separado

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

O WZ MasterFila já existe como aplicação própria (Fastify + React). Precisamos decidir se ele
é **absorvido** como módulo interno do WZ Connect (opção A) ou **mantido separado** e
integrado (opção B). Absorver exigiria reescrever/portar todo o MasterFila; mantê-lo separado
preserva o investimento existente e permite evolução independente, ao custo de dois runtimes.

## Decisão

**Manter o MasterFila como aplicação separada (opção B)**, integrada ao WZ Connect por um
**SDK cliente** — **`@wz/connect-sdk`** (padrão **Adapter**) publicado a partir de
`packages/shared`. O Connect é o control plane; o MasterFila é um consumidor.

O SDK encapsula:

- **Validação de token** (JWT RS256 via JWKS do Connect — ADR-008);
- **Resolução das credenciais do banco do tenant** (o Connect provisiona o banco e entrega as credenciais; ambos os runtimes usam o **mesmo banco do tenant**, preservando o isolamento físico);
- **Checagem de módulo/plano/limite** habilitado para a empresa.

Migração incremental (sem big-bang, com feature flag):

1. **Coexistência** — Connect existe; MasterFila mantém auth próprio; CORE espelha tenants/usuários.
2. **Delegação** — MasterFila loga via Connect e obtém credenciais do banco pelo SDK.
3. **Fonte única** — CRUD de tenants/usuários/planos só no console do Connect.

## Impacto no MasterFila (reescrita aprovada)

Ponto de honestidade de esforço: escolher "app separado" **não** significa "zero reescrita".
Hoje o MasterFila é **multi-tenant num banco único** com `organizacao_id` em cada query. Sob
Database Per Tenant (ADR-004), ele passa a falar com **um banco por empresa, resolvido
dinamicamente** — ou seja, precisa da mesma resolução de conexão do Connect. **Reescrita
aprovada em 2026-07-14**, com este escopo:

1. **Conexão dinâmica** — o MasterFila deixa a conexão fixa/única e passa a obter a conexão do
   tenant via `@wz/connect-sdk` (que resolve subdomínio → credenciais do banco no CORE).
   Reaproveita o `TenantConnectionRegistry`/`AsyncLocalStorage` (ADR-005), publicado no SDK.
2. **Remoção do `organizacao_id`** — como o isolamento vira físico, as queries e o schema saem
   do filtro por coluna. Aplicado via **expand/contract** (ADR-009) para não quebrar em produção.
3. **Auth delegada** — a tela de login e a validação de token passam a usar o Connect (JWKS),
   pelo SDK.
4. **Migração de dados** — o banco único atual é **fatiado** em um banco por empresa (script de
   split idempotente, por `organizacao_id`), executado na Fase 5.

Esforço concentrado em **conexão + auth + split de dados**; a lógica de fila/tickets do
MasterFila é preservada. O rework de código ocorre na **Fase 5** (não no planejamento atual).

## Consequências

**Positivas**

- Preserva a **lógica de negócio** do MasterFila; a reescrita fica isolada em conexão/auth/dados.
- Evolução e deploy independentes dos dois produtos.
- Contrato de integração único e testável no SDK (DRY); o MasterFila nunca fala JWKS/CORE "na mão".
- Isolamento físico por empresa mantido — os dois runtimes compartilham o banco do tenant.

**Trade-offs**

- **Dois runtimes** para manter e observar.
- O banco do tenant é acessado por dois processos — exige convenção de ownership de tabelas por módulo e cuidado com migrações concorrentes (coordenadas pelo Connect — ADR-009).
- Duas stacks de auth durante a fase de coexistência.

## Alternativas consideradas

- **Absorver como módulo interno (opção A)** — máxima coesão com o sistema de módulos (ADR-007), mas exige portar todo o MasterFila agora; adiado, não descartado para o futuro.
- **Integração só por webhooks, sem SDK** — espalharia a lógica de token/credenciais/limites por cada produto, ferindo DRY.
