/** Estado de bloqueio de login de um usuário. */
export interface LockState {
  readonly tentativasLogin: number;
  readonly bloqueadoAte: Date | null;
}

/** Máximo de tentativas antes do bloqueio (ADR-008). */
export const MAX_ATTEMPTS = 5;

/** Duração do bloqueio: 15 minutos. */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/** Indica se a conta está bloqueada no instante `now`. */
export function isLocked(state: LockState, now: Date): boolean {
  return state.bloqueadoAte !== null && state.bloqueadoAte.getTime() > now.getTime();
}

/**
 * Estado após uma tentativa falha. Ao atingir {@link MAX_ATTEMPTS}, bloqueia por
 * {@link LOCK_DURATION_MS} e zera o contador (recomeça após o bloqueio expirar).
 */
export function registerFailure(state: LockState, now: Date): LockState {
  const tentativasLogin = state.tentativasLogin + 1;
  if (tentativasLogin >= MAX_ATTEMPTS) {
    return { tentativasLogin: 0, bloqueadoAte: new Date(now.getTime() + LOCK_DURATION_MS) };
  }
  return { tentativasLogin, bloqueadoAte: null };
}

/** Estado após um login bem-sucedido: zera tentativas e remove bloqueio. */
export function registerSuccess(): LockState {
  return { tentativasLogin: 0, bloqueadoAte: null };
}
