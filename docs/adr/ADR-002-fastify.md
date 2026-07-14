# ADR-002: Fastify como framework backend

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin
- **Histórico:** a v0.2 do documento propôs NestJS (Fastify adapter); revertido na v0.3 por
  consistência com a suíte e menor risco. Este ADR consolida a escolha por **Fastify puro**.

## Contexto

O WZ Connect é uma aplicação **modular** com resolução de tenant por requisição, módulos
plugáveis, autorização e reuso de conexões por tenant. Precisamos de um framework HTTP que
sustente esses conceitos sem adicionar risco desnecessário. Fatores do contexto real do time:
o **WZ MasterFila** já roda em Fastify, o time domina a stack, e a lei do projeto exige
**Vitest**.

## Decisão

Adotar **Fastify 5.x** (puro), como no MasterFila.

- **Contexto de tenant** via `onRequest`/`preHandler` **hooks** + **`AsyncLocalStorage`** (ADR-005).
- **Módulos** como **plugins encapsulados**, carregados por `@fastify/autoload` (ADR-007). O encapsulamento do Fastify isola hooks/decorators/error handlers de cada módulo.
- **Autorização** por hooks declarativos + um `AuthorizationService` único (padrão Policy).
- **DI leve** por composição de funções/factories (ou `awilix` se a árvore crescer) — sem container pesado.
- Plugins conhecidos: `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/websocket`.

## Consequências

**Positivas**

- **Consistência total** com o MasterFila e o resto da suíte; conhecimento reaproveitado.
- **Vitest nativo**, sem a fricção de adaptar o runner do NestJS (Jest por padrão).
- Menos abstração/"mágica"; controle direto do ciclo de request.
- Performance de primeira linha; ecossistema de plugins maduro.

**Trade-offs**

- Sem estrutura imposta: convenções de organização (módulos, camadas) precisam ser mantidas por disciplina e review, não pelo framework.
- DI e ciclo de vida de módulos são responsabilidade nossa (mitigado por `autoload` + factories testáveis).

## Alternativas consideradas

- **NestJS (Fastify adapter)** — estrutura pronta de módulos/DI/guards; bom para times grandes, mas curva de aprendizado, divergência da suíte e fricção com Vitest. Os ganhos de guardrail não compensam o risco no contexto atual. Reavaliável se o time crescer muito.
- **Express** — mais lento e com ecossistema legado; sem vantagem sobre o Fastify que o time já usa.
