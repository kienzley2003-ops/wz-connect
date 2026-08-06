# ADR-0007 — Single-Session Enforcement

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

`wz-masterfila` já implementa a regra "um usuário só pode ter uma sessão ativa por vez" (`usuarios.sessao_ativa_id`, invalidada via evento WS `usuario:sessao_encerrada` quando um novo login acontece). Isso evita que uma sessão comprometida (ex.: laptop roubado, sessão esquecida aberta em terminal público) conviva silenciosamente com uma sessão legítima sem que o usuário perceba. Como o Connect concentra login de todo o hub, essa garantia precisa existir de forma central, não replicada por módulo.

## Decisão

Modelar uma tabela **`sessions`**, uma linha por login bem-sucedido, vinculada a `user_id` + `organization_id`. Cada `refresh_token` (ADR-0004) referencia uma `session_id`.

Ao autenticar, o Connect:
1. Marca qualquer sessão anterior do mesmo `user_id` (na mesma organização) como `revoked_at = now()`.
2. Invalida todos os `refresh_tokens` vinculados a essa sessão antiga.
3. Cria a nova `session` e o novo `refresh_token`.

O access token (JWT) carrega `session: <sessionId>`. Toda validação de token confere se `session.revoked_at IS NULL` — se a sessão foi revogada (por novo login), o token é rejeitado mesmo que ainda não tenha expirado (dentro da janela de 15 min do ADR-0004).

Um usuário com memberships em múltiplas organizações pode ter uma sessão ativa **por organização** simultaneamente (login em `acme.wz-hub.com` não derruba a sessão em `beta.wz-hub.com`) — a regra de sessão única é por par `(user_id, organization_id)`, não global ao usuário.

## Consequências

**Positivas:**
- Portado de um comportamento já validado em produção pelo `wz-masterfila` — sem necessidade de desenhar do zero.
- Usuário final ganha uma garantia de segurança perceptível: login em outro lugar avisa e encerra a sessão anterior.
- Simplifica revogação administrativa: suporte/segurança pode encerrar a sessão ativa de um usuário sem esperar o token expirar.

**Negativas:**
- Verificação de `session.revoked_at` em toda requisição adiciona uma consulta (ou lookup em cache Redis) — precisa de cache para não virar gargalo, dado que roda em todo request autenticado do hub.
- Usuários legítimos que alternam entre dispositivos (ex.: celular e desktop) vão perceber logout forçado no dispositivo anterior — comportamento intencional, mas precisa de mensagem de UI clara ("você foi desconectado porque um novo login foi feito em outro dispositivo").

## Alternativas Rejeitadas

- **Múltiplas sessões simultâneas com listagem/revogação manual** (o usuário vê "3 dispositivos ativos" e revoga manualmente): mais flexível, mas o padrão `wz-masterfila` já opta pela segurança do corte automático — manter consistência entre módulos evita dois comportamentos diferentes de sessão dentro do hub. Pode virar uma opção futura em Configurações da conta.
- **Sem enforcement de sessão (apenas expiração natural do token):** rejeitado — remove a garantia de segurança que motivou este ADR.
