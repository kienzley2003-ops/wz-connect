# ADR-0002 — pnpm Monorepo com SDK Publicável

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

O wz-connect precisa expor três superfícies: uma API backend, um frontend (Hub Admin + Org Admin no mesmo app, por modo), e um SDK cliente consumido por `wz-masterfila`, `wz-desk`, `wz-orc` e `wz-agente`. Hoje `wz-masterfila` consome um SDK provisório via tarball vendorizado (`wz-masterfila/vendor/wz-connect-sdk-0.2.0.tgz`), o que impede versionamento real e força republicação manual a cada mudança.

## Decisão

Estruturar o `wz-connect` como **pnpm monorepo**, seguindo o padrão já usado em `wz-masterfila` e `wz-agente`:

```
wz-connect/
├── apps/
│   ├── backend/          # API Fastify
│   └── frontend/         # Hub Admin + Org Admin (mesmo app, roteamento por modo)
├── packages/
│   ├── shared/           # tipos internos (Organization, User, JwtPayload, etc.)
│   └── connect-sdk/      # SDK público consumido pelos módulos do hub
└── docs/adr/
```

`packages/connect-sdk` é o **substituto direto** do tarball vendor: enquanto não há registry privado, os módulos consumidores usam `workspace:*` (se movidos para o mesmo monorepo) ou instalação via Git+subpath; quando houver necessidade de publicação real, o mesmo pacote vai para um registry (npm privado ou GitHub Packages) sem mudar a estrutura interna.

## Consequências

**Positivas:**
- Mesmo padrão de tooling que `wz-masterfila`/`wz-agente` — Vitest ≥85%, ESLint flat config, Husky pre-push, sem retrabalho de configuração.
- SDK como workspace elimina o passo manual de gerar e copiar tarball a cada mudança de contrato.
- `packages/shared` evita duplicação de tipos entre backend e frontend do próprio Connect.

**Negativas:**
- Módulos externos ao monorepo (`wz-masterfila`, `wz-desk`, `wz-orc`, `wz-agente` são repositórios Git separados) não podem usar `workspace:*` diretamente — vão precisar de um passo de build+publish (mesmo que simples) até existir um registry privado. Isso é uma pendência explícita, não bloqueante para o MVP do Connect em si.

## Alternativas Rejeitadas

- **Backend único sem monorepo:** mais simples no dia 1, mas o Hub Admin/Org Admin e o SDK público são partes inseparáveis do escopo do Connect — cedo ou tarde viraria monorepo mesmo, então já começamos correto.
- **npm workspaces** (como `wz-orc`): funcional, mas os outros dois projetos mais próximos em maturidade e propósito (`wz-masterfila`, `wz-agente`) usam pnpm — manter consistência de tooling entre os projetos que efetivamente compartilham padrão de auth (via este ADR) reduz custo cognitivo.
