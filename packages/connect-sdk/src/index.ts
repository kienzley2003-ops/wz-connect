// SDK público consumido por wz-desk, wz-masterfila, wz-orc e wz-agente
// (substitui o tarball vendor de wz-masterfila/vendor/wz-connect-sdk-0.2.0.tgz
// — ver ADR 0002).
//
// Estrutura prevista (preenchida pelas duas frentes do MVP):
//   connect.auth.verifyToken(token)          — Frente A
//   connect.auth.refresh(refreshToken)       — Frente A
//   connect.audit.log(event)                 — Frente A
//   connect.entitlements.check(orgId, prod)  — Frente B
//   connect.entitlements.getActiveEntitlements(orgId) — Frente B
//
// Nenhuma implementação ainda — este arquivo existe para o pacote instalar
// e resolver como workspace válido antes da divisão do trabalho.
export {}
