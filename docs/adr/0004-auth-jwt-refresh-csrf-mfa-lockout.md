# ADR-0004 — Autenticação: JWT + Refresh Rotativo + CSRF + MFA + Lockout

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

Dos quatro produtos do hub, `wz-agente` tem o desenho de autenticação mais maduro e mais bem documentado (ADR 005 daquele projeto): access JWT curto + refresh token opaco rotativo + CSRF double-submit + MFA TOTP + account lockout — desenhado especificamente para separar o modelo de ameaça de dashboards humanos (o caso do Connect) do de agentes automatizados (não aplicável aqui). `wz-masterfila` usa uma variante mais simples (JWT + sessão única, sem refresh rotativo, lockout de 15 min). Como o Connect concentra a autenticação de **todo** o hub, a decisão de segurança aqui tem o maior raio de impacto de qualquer ADR do sistema — não vale a pena reinventar quando já existe um desenho testado e documentado.

## Decisão

O wz-connect **herda o padrão de autenticação do `wz-agente` (ADR 005 daquele projeto)** para autenticação humana (dashboard e SSO), com os seguintes parâmetros:

- **Access token:** JWT, 15 minutos de validade, assinado HS256, entregue em cookie `httpOnly` + `Secure` (em ambientes remotos) + `SameSite=Lax`.
- **Refresh token:** opaco (não-JWT), 7 dias de validade, **rotacionado a cada uso** (mitiga replay de token roubado), armazenado hasheado (`token_hash`) na tabela `refresh_tokens`.
- **CSRF:** double-submit cookie — todo endpoint mutável exige `X-CSRF-Token` correspondente ao cookie.
- **MFA:** TOTP (RFC 6238), implementação pure Node.js sem dependência externa (mesma abordagem do `wz-agente`, que evita `otplib`). Opcional por usuário; **obrigatório** para `owner` de organização e para `super_admin` do hub.
- **Hash de senha:** `bcryptjs` (puro JS) — **não usar `bcrypt` nativo**, mesma decisão do `wz-agente` (evita dependência de toolchain C++ em builds Docker).
- **Account lockout:** 5 tentativas falhas → bloqueio de 30 minutos.
- **Single-session enforcement:** ver ADR-0007 (complementar a este).

## Consequências

**Positivas:**
- Reaproveita um desenho já revisado e documentado, reduzindo risco de reinventar mal algo tão crítico.
- Consistência: um usuário que já usa `wz-agente` reconhece o mesmo comportamento de segurança no Connect.
- `bcryptjs` e MFA pure-JS evitam problemas de build já identificados no `wz-agente`.

**Negativas:**
- Refresh rotativo exige mais lógica no cliente/SDK (`@wz/connect-sdk`) do que uma sessão única simples — todo módulo consumidor precisa implementar o fluxo de refresh corretamente.
- Lockout de 30 minutos é mais rígido que o padrão atual de `wz-masterfila` (15 min) — usuários migrados sentirão essa diferença; comunicar na migração (ver `wz-masterfila-pendencias.md`).

## Alternativas Rejeitadas

- **Sessão única sem refresh** (padrão atual do `wz-masterfila`): mais simples, mas força re-login a cada expiração de token — pior UX para um sistema que concentra login de todo o hub.
- **JWT longo sem refresh** (ex.: 7 dias direto no access token): rejeitado por segurança — token comprometido fica válido por muito tempo sem mecanismo de revogação granular.
- **bcrypt nativo:** rejeitado pelo mesmo motivo do `wz-agente` — dependência de compilação nativa complica Docker multi-stage e CI.
