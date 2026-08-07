export interface LockoutState {
  failedLoginCount: number
  lockedUntil: Date | null
}

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 30

export function isLocked(state: LockoutState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime()
}

export function recordFailure(state: LockoutState, now: Date = new Date()): LockoutState {
  const failedLoginCount = state.failedLoginCount + 1
  if (failedLoginCount >= MAX_ATTEMPTS) {
    return {
      failedLoginCount,
      lockedUntil: state.lockedUntil ?? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
    }
  }
  return { failedLoginCount, lockedUntil: state.lockedUntil }
}

export function recordSuccess(): LockoutState {
  return { failedLoginCount: 0, lockedUntil: null }
}
