# ADR-007: Sistema de módulos via plugins Fastify encapsulados

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin
- **Histórico:** a v0.2 propôs NestJS Dynamic Modules; com a manutenção do Fastify (ADR-002),
  os módulos passam a ser **plugins Fastify**.

## Contexto

O WZ Connect hospeda vários produtos como funcionalidades plugáveis. Cada tenant habilita um
subconjunto de módulos (registrados em `tenant_modules` no CORE). Precisamos carregar módulos
de forma uniforme, isolar o escopo de cada um, bloquear acesso a módulo não contratado e
montar a navegação do frontend dinamicamente — sem duplicar lógica de bootstrap por módulo.

## Decisão

Modelar cada produto como um **plugin Fastify encapsulado**, registrado via `ModulesRegistry`,
que implementa um **contrato comum** (padrão Adapter):

```ts
interface WzModule {
  key: string; // 'masterfila'
  schema: DrizzleSchema; // tabelas no banco do tenant
  migrations: MigrationSet; // aplicadas por tenant (ADR-009)
  plugin: FastifyPluginAsync; // rotas em /api/v1/<key>/*
  seed?: (db) => Promise<void>; // seed inicial no provisionamento
}
```

- O **encapsulamento do Fastify** garante que hooks, decorators e error handlers de um módulo **não vazem** para os outros — isolamento natural, sem framework extra.
- Um **`ModulesRegistry`** cruza os plugins carregados com os módulos habilitados do tenant.
- Um **hook `preHandler`** (`ModuleEnabledHook`) responde `403 module_not_enabled` quando o tenant não tem o módulo.
- O **frontend** consulta `/auth/me` (campo `mods`) e monta a navegação/telas por módulo.

## Consequências

**Positivas**

- Adicionar um produto = criar um plugin que cumpre o contrato e registrá-lo no registry; o `registerModules` faz o resto (prefixo + guards).
- Habilitar/desabilitar por tenant é dado no CORE, sem deploy.
- Contrato único (schema+migrations+plugin+seed) mantém os módulos consistentes (DRY).
- Zero dependência de framework além do Fastify já adotado.

**Trade-offs**

- Todos os módulos vivem no mesmo runtime (modular monolith) — acoplamento de deploy; aceitável no estágio atual e reversível (um plugin pode virar serviço depois).
- Disciplina necessária para módulos não acessarem tabelas uns dos outros diretamente.

## Emenda (2026-07-14, na implementação da Fase 3)

A proposta original carregava os plugins com **`@fastify/autoload`** (descoberta por convenção
de diretório). Na implementação optamos por **registro explícito** numa lista
(`modules/index.ts` → `createModulesRegistry()`), porque:

- é **determinístico** — a ordem e o conjunto de módulos não dependem do sistema de arquivos;
- é **testável** — o registry é uma classe pura, coberta por testes unitários (duplicidade,
  `enabledFor`, `missing`/drift), o que a mágica de FS não permitiria;
- evita uma dependência a mais para um ganho pequeno (a lista tem uma linha por módulo).

O `registerModules` continua usando o **encapsulamento de plugins do Fastify** (`app.register`
com prefixo), que é o coração desta decisão — e isso está verificado por teste (hooks de um
módulo não vazam para outro). `@fastify/autoload` sai da stack para este fim.

## Alternativas consideradas

- **NestJS Dynamic Modules** — estrutura pronta, mas exigiria adotar o NestJS (rejeitado no ADR-002).
- **Microserviços por produto** — isolamento de deploy, mas custo operacional e latência altos para agora.
- **Feature flags sem plugins formais** — não estrutura schema/migrations/rotas por produto.
- **Absorver o MasterFila como módulo interno (opção A)** — descartado nesta fase: MasterFila permanece app separado (ver ADR-011).
