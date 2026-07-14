# ADR-010: TDD, cobertura 85%, commit atômico e git flow

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

O WZ Connect é infraestrutura crítica: erro em resolução de tenant, cifra de credenciais ou
migração afeta todos os clientes. Precisamos de garantias de qualidade verificáveis e um
fluxo de versionamento previsível. Estas práticas são declaradas como **lei** do projeto.

## Decisão

- **TDD obrigatório** (Red → Green → Refactor): nenhum código de produção sem um teste que
  falhou antes. PR sem teste correspondente é bloqueado em review.
- **Cobertura ≥ 85%** nos módulos unit-testáveis (funções puras + services sem dependência de
  DB/HTTP), medida por **Vitest**, travada em **pre-push (Husky)** e **CI**. Módulos de
  fronteira (controllers, resolução real de conexão) cobertos por testes de integração/E2E.
- **Commit atômico** — um commit = uma mudança coesa que compila e passa nos testes.
  **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`),
  validados por **commitlint**.
- **Git flow** — `main` (produção, protegida) ← `develop` (integração) ←
  `feature/*`, `fix/*`, `chore/*`. Sem push direto em `main`/`develop`; merge via PR com review.
- **Qualidade** — ESLint + Prettier no pre-commit; pipeline de CI roda lint + test + coverage.

## Consequências

**Positivas**

- Regressões pegas cedo; refatoração segura (essencial num sistema com muitos bancos).
- Histórico legível e bissetável (commits atômicos + conventional commits).
- Onboarding e review previsíveis; `main` sempre entregável.

**Trade-offs**

- Ritmo inicial mais lento (escrever teste antes) — compensado pela redução de retrabalho e incidentes.
- Coverage gate pode gerar testes de baixo valor se aplicado cegamente — mitigado medindo só módulos unit-testáveis e revisando qualidade do teste, não só o número.

## Alternativas consideradas

- **Testes depois do código / cobertura sem gate** — na prática vira dívida técnica; contraria a criticidade do sistema.
- **Trunk-based development** — ágil, mas o time prefere a previsibilidade de `main`/`develop` com PRs; pode ser reavaliado quando houver CI/CD maduro.
