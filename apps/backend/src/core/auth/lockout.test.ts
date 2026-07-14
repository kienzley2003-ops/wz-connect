import { describe, it, expect } from 'vitest';
import {
  isLocked,
  registerFailure,
  registerSuccess,
  MAX_ATTEMPTS,
  LOCK_DURATION_MS,
  type LockState,
} from './lockout.js';

const now = new Date('2026-07-14T12:00:00.000Z');

describe('lockout', () => {
  describe('isLocked', () => {
    it('está bloqueado quando bloqueadoAte é futuro', () => {
      const state: LockState = { tentativasLogin: 0, bloqueadoAte: new Date(now.getTime() + 1000) };
      expect(isLocked(state, now)).toBe(true);
    });

    it('não está bloqueado quando bloqueadoAte já passou', () => {
      const state: LockState = { tentativasLogin: 0, bloqueadoAte: new Date(now.getTime() - 1000) };
      expect(isLocked(state, now)).toBe(false);
    });

    it('não está bloqueado quando bloqueadoAte é null', () => {
      expect(isLocked({ tentativasLogin: 3, bloqueadoAte: null }, now)).toBe(false);
    });
  });

  describe('registerFailure', () => {
    it('incrementa as tentativas abaixo do limite sem bloquear', () => {
      const next = registerFailure({ tentativasLogin: 1, bloqueadoAte: null }, now);
      expect(next.tentativasLogin).toBe(2);
      expect(next.bloqueadoAte).toBeNull();
    });

    it('bloqueia por 15 min ao atingir o limite e zera o contador', () => {
      const next = registerFailure({ tentativasLogin: MAX_ATTEMPTS - 1, bloqueadoAte: null }, now);
      expect(next.tentativasLogin).toBe(0);
      expect(next.bloqueadoAte?.getTime()).toBe(now.getTime() + LOCK_DURATION_MS);
    });
  });

  describe('registerSuccess', () => {
    it('zera tentativas e desbloqueio', () => {
      const next = registerSuccess();
      expect(next).toEqual({ tentativasLogin: 0, bloqueadoAte: null });
    });
  });
});
