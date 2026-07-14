# ADR-001: Monorepo com pnpm workspaces

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

O WZ Connect tem backend (Fastify), frontend (React) e código compartilhado (tipos, contratos
Zod, constantes de módulos/planos, futuro `@wz/connect-sdk`). Precisamos de builds
independentes, dependências isoladas por pacote e compartilhamento de tipos sem publicar em
registry. O ecossistema WZ (MasterFila) já usa pnpm workspaces com sucesso.

## Decisão

Usar **pnpm workspaces** organizando o repositório em `apps/*` e `packages/*`:

```
apps/backend    apps/frontend    packages/shared
```

O `packages/shared` centraliza tipos e contratos consumidos por backend e frontend, e
posteriormente exporta o `@wz/connect-sdk` para produtos externos (MasterFila).

## Consequências

**Positivas**

- Compartilhamento de tipos em tempo de compilação, sem versionar/publicar.
- Instalação eficiente (store global do pnpm, hardlinks) e `node_modules` enxuto.
- Ferramentas (lint, test, coverage) padronizadas na raiz via filtros `pnpm --filter`.
- Continuidade com o conhecimento acumulado no MasterFila.

**Trade-offs**

- Todos os desenvolvedores precisam do pnpm (não npm/yarn) — mitigado com `packageManager` no `package.json` e Corepack.
- Hoisting/symlinks do pnpm exigem cuidado no Docker (usar `pnpm deploy --prod`).

## Alternativas consideradas

- **npm/yarn workspaces** — menos eficientes em disco e resolução; pnpm já é o padrão da casa.
- **Nx/Turborepo** — orquestração e cache poderosos, mas complexidade extra desnecessária neste estágio; pode ser adotado depois sobre o pnpm.
- **Polyrepo** — descarta o ganho de compartilhar tipos/contratos; mais atrito de versionamento.
