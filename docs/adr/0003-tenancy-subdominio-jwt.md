# ADR-0003 — Tenancy via Subdomínio + JWT

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

Cada módulo do hub resolve tenancy de um jeito diferente hoje: `wz-masterfila` usa um `TENANT_VAULT` local (JSON de credenciais por subdomínio) + `BASE_DOMAIN`; `wz-orc` resolve organização só no servidor via função própria (`organizacaoAtual()`); `wz-agente` e `wz-desk` mantêm `organization_id`/`companyId` fixo por instalação. Essa fragmentação significa que "qual organização é essa requisição" é respondido de quatro formas diferentes no hub.

## Decisão

O **wz-connect assume 100% da resolução de tenancy**. Um cliente acessa `acme.wz-hub.com`, o Connect resolve `acme` → `organizationId`, autentica o usuário e emite um **JWT que carrega o campo curto `org`** (não `organizationId` por extenso, para manter o payload pequeno). Todo módulo downstream **para de resolver tenant por conta própria** e passa a confiar exclusivamente no `org` do token validado.

Fluxo:
1. Requisição chega em `acme.wz-hub.com` (ou o módulo de destino, com o subdomínio propagado via cookie/redirect de SSO).
2. Connect resolve `acme` → `organizations.slug = 'acme'` → `organizationId`.
3. Login/SSO emite JWT com `org: <organizationId>`.
4. Módulo (`wz-masterfila`, etc.) valida o JWT via `@wz/connect-sdk` e usa `org` diretamente — nunca resolve tenant por hostname próprio.

## Consequências

**Positivas:**
- Um único lugar de verdade para "quem é essa organização" — elimina a divergência de quatro implementações.
- `wz-masterfila` pode eventualmente aposentar `TENANT_VAULT`/`BASE_DOMAIN` (registrado em `wz-masterfila-pendencias.md`); `wz-orc` aposenta `organizacaoAtual()` próprio (registrado em `wz-orc-pendencias.md`).
- Simplifica onboarding: criar uma organização automaticamente reserva o subdomínio.

**Negativas:**
- Migração de tenancy nos módulos existentes é trabalho não-trivial (rename de coluna, troca de middleware) — mas já está mapeado nos arquivos `*-pendencias.md` e só será aplicado quando o Connect estiver pronto e estável, por decisão explícita do usuário.
- Enquanto a migração dos módulos não acontece, `wz-masterfila` mantém `BASE_DOMAIN` como fallback de compatibilidade transitória.

## Alternativas Rejeitadas

- **Path-based tenancy** (`wz-hub.com/acme/...`): mais simples de operar (sem DNS wildcard), mas pior para produtos que rodam como app quase standalone por cliente (ex.: painel de TV do `wz-masterfila` fixado num navegador dedicado) — subdomínio permite URL fixa e memorável por cliente.
- **Cada módulo mantém sua própria resolução, Connect só valida identidade:** rejeitada porque perpetua a fragmentação atual — o problema que motivou este ADR continuaria existindo.
