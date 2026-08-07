# Auth Primitives + Tenancy Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every pure, unit-testable building block that the Frente A auth flow depends on — error types, crypto primitives (safe-compare, refresh token, TOTP), the four stateless auth services (password, lockout, CSRF, MFA), the entitlements stub, and tenant resolution — each fully covered by tests written first (TDD).

**Architecture:** Small, single-responsibility, mostly-pure functions/modules with no Fastify or live-DB dependency (tenancy resolver takes its DB lookup as an injected function, so it's unit-testable too). This is **Plan 1 of a multi-plan sequence** for the Frente A spec (`docs/superpowers/specs/2026-08-06-connect-parte-a-design.md`) — it deliberately stops short of session/token services, Fastify routes, hooks, and the `sessions.organization_id` migration, because those need a live Postgres and Fastify wiring (Plan 2). Everything built here is a dependency of Plan 2.

**Tech Stack:** TypeScript (NodeNext ESM — relative imports use `.js`), Vitest 2.x, `node:crypto`, `bcryptjs`.

## Global Constraints

- TDD required for every task: write the failing test, watch it fail, then write the minimal code to pass — never write implementation before its test (user's explicit instruction).
- Coverage ≥85% (lines/functions/branches/statements) — spec §7, matches `wz-agente`/`wz-masterfila` house rule.
- Relative imports between `.ts` files must use the `.js` extension (NodeNext moduleResolution — see `apps/backend/src/server.ts` for the existing pattern).
- `bcryptjs`, never native `bcrypt` (ADR-0004).
- MFA is pure Node.js (`node:crypto` only) — no `otplib` or other TOTP dependency (ADR-0004).
- All new files live under `apps/backend/src/`, on branch `feature/auth-tenancy-core`.
- Every task ends with a commit. Use `git add <exact files>` — never `git add -A`.

---

## Task 1: Vitest config + `lib/errors.ts`

**Files:**
- Create: `apps/backend/vitest.config.ts`
- Create: `apps/backend/src/lib/errors.ts`
- Test: `apps/backend/src/lib/errors.test.ts`

**Interfaces:**
- Produces: `AppError` (base class: `code: string`, `statusCode: number`, `message: string`, `details?: Record<string, unknown>`) and subclasses `LockedAccountError(lockedUntil: Date)`, `InvalidCredentialsError()`, `MfaRequiredError()`, `MfaInvalidError()`, `MfaNotEnrolledError()`, `CsrfMismatchError()`, `SessionRevokedError()`, `TenantNotFoundError(host: string)`, `NotAMemberError()`, `ImpersonationForbiddenError()`, `CrossOrgAccessError()`. Every later task that needs to signal a typed failure imports from `../lib/errors.js`.

- [ ] **Step 1: Create the Vitest config (no test cycle — this is project setup, not logic)**

```ts
// apps/backend/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/routes/**',
        'src/**/routes.ts',
        'src/server.ts',
        'src/db/migrate.ts',
        'src/db/schema.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
```

- [ ] **Step 2: Write the failing test for `AppError` and its subclasses**

```ts
// apps/backend/src/lib/errors.test.ts
import { describe, it, expect } from 'vitest'
import {
  AppError,
  LockedAccountError,
  InvalidCredentialsError,
  MfaRequiredError,
  MfaInvalidError,
  MfaNotEnrolledError,
  CsrfMismatchError,
  SessionRevokedError,
  TenantNotFoundError,
  NotAMemberError,
  ImpersonationForbiddenError,
  CrossOrgAccessError,
} from './errors.js'

describe('AppError', () => {
  it('carries code, statusCode, message and details', () => {
    const err = new AppError('custom-code', 418, 'mensagem', { foo: 'bar' })
    expect(err.code).toBe('custom-code')
    expect(err.statusCode).toBe(418)
    expect(err.message).toBe('mensagem')
    expect(err.details).toEqual({ foo: 'bar' })
    expect(err).toBeInstanceOf(Error)
  })
})

describe('subclasses de AppError', () => {
  it('LockedAccountError expõe lockedUntil e status 423', () => {
    const until = new Date('2026-01-01T00:00:00Z')
    const err = new LockedAccountError(until)
    expect(err.code).toBe('account-locked')
    expect(err.statusCode).toBe(423)
    expect(err.lockedUntil).toBe(until)
  })

  it('InvalidCredentialsError usa status 401', () => {
    const err = new InvalidCredentialsError()
    expect(err.code).toBe('invalid-credentials')
    expect(err.statusCode).toBe(401)
  })

  it('MfaRequiredError usa status 401', () => {
    expect(new MfaRequiredError().code).toBe('mfa-required')
  })

  it('MfaInvalidError usa status 401', () => {
    expect(new MfaInvalidError().code).toBe('mfa-invalid')
  })

  it('MfaNotEnrolledError usa status 400', () => {
    const err = new MfaNotEnrolledError()
    expect(err.code).toBe('mfa-not-enrolled')
    expect(err.statusCode).toBe(400)
  })

  it('CsrfMismatchError usa status 403', () => {
    const err = new CsrfMismatchError()
    expect(err.code).toBe('csrf-mismatch')
    expect(err.statusCode).toBe(403)
  })

  it('SessionRevokedError usa status 401', () => {
    expect(new SessionRevokedError().code).toBe('session-revoked')
  })

  it('TenantNotFoundError expõe host e status 400', () => {
    const err = new TenantNotFoundError('naoexiste.wz-hub.com')
    expect(err.code).toBe('tenant-not-found')
    expect(err.statusCode).toBe(400)
    expect(err.host).toBe('naoexiste.wz-hub.com')
    expect(err.details).toEqual({ host: 'naoexiste.wz-hub.com' })
  })

  it('NotAMemberError usa status 403', () => {
    expect(new NotAMemberError().code).toBe('not-a-member')
  })

  it('ImpersonationForbiddenError usa status 403', () => {
    expect(new ImpersonationForbiddenError().code).toBe('impersonation-forbidden')
  })

  it('CrossOrgAccessError usa status 403', () => {
    expect(new CrossOrgAccessError().code).toBe('cross-org-access')
  })
})
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- errors.test.ts`
Expected: FAIL — `Cannot find module './errors.js'`

- [ ] **Step 4: Implement `lib/errors.ts`**

```ts
// apps/backend/src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class LockedAccountError extends AppError {
  constructor(public lockedUntil: Date) {
    super('account-locked', 423, 'Conta bloqueada por excesso de tentativas', { lockedUntil })
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('invalid-credentials', 401, 'Email ou senha inválidos')
  }
}

export class MfaRequiredError extends AppError {
  constructor() {
    super('mfa-required', 401, 'MFA obrigatório')
  }
}

export class MfaInvalidError extends AppError {
  constructor() {
    super('mfa-invalid', 401, 'Código MFA inválido')
  }
}

export class MfaNotEnrolledError extends AppError {
  constructor() {
    super('mfa-not-enrolled', 400, 'MFA não configurado')
  }
}

export class CsrfMismatchError extends AppError {
  constructor() {
    super('csrf-mismatch', 403, 'Token CSRF inválido')
  }
}

export class SessionRevokedError extends AppError {
  constructor() {
    super('session-revoked', 401, 'Sessão revogada por novo login')
  }
}

export class TenantNotFoundError extends AppError {
  constructor(public host: string) {
    super('tenant-not-found', 400, 'Subdomínio não resolve para nenhuma organização', { host })
  }
}

export class NotAMemberError extends AppError {
  constructor() {
    super('not-a-member', 403, 'Usuário não pertence a esta organização')
  }
}

export class ImpersonationForbiddenError extends AppError {
  constructor() {
    super('impersonation-forbidden', 403, 'Apenas super-admin pode impersonar')
  }
}

export class CrossOrgAccessError extends AppError {
  constructor() {
    super('cross-org-access', 403, 'Acesso negado a recurso de outra organização')
  }
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- errors.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/vitest.config.ts apps/backend/src/lib/errors.ts apps/backend/src/lib/errors.test.ts
git commit -m "test+feat(backend): add AppError hierarchy and vitest coverage config"
```

---

## Task 2: `auth/lib/safe-compare.ts`

**Files:**
- Create: `apps/backend/src/auth/lib/safe-compare.ts`
- Test: `apps/backend/src/auth/lib/safe-compare.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `safeEqual(a: string, b: string): boolean`. Used by Task 3 (refresh-token) and Task 7 (csrf.service).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/lib/safe-compare.test.ts
import { describe, it, expect } from 'vitest'
import { safeEqual } from './safe-compare.js'

describe('safeEqual', () => {
  it('retorna true para strings idênticas', () => {
    expect(safeEqual('segredo123', 'segredo123')).toBe(true)
  })

  it('retorna false para strings diferentes do mesmo tamanho', () => {
    expect(safeEqual('segredo123', 'segredo456')).toBe(false)
  })

  it('retorna false para strings de tamanhos diferentes', () => {
    expect(safeEqual('curto', 'muito-mais-longo')).toBe(false)
  })

  it('retorna false para string vazia comparada com não-vazia', () => {
    expect(safeEqual('', 'algo')).toBe(false)
  })

  it('retorna true para duas strings vazias', () => {
    expect(safeEqual('', '')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- safe-compare.test.ts`
Expected: FAIL — `Cannot find module './safe-compare.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/lib/safe-compare.ts
import { timingSafeEqual } from 'node:crypto'

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    return false
  }
  return timingSafeEqual(bufA, bufB)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- safe-compare.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/lib/safe-compare.ts apps/backend/src/auth/lib/safe-compare.test.ts
git commit -m "test+feat(backend): add timing-safe string comparison"
```

---

## Task 3: `auth/lib/refresh-token.ts`

**Files:**
- Create: `apps/backend/src/auth/lib/refresh-token.ts`
- Test: `apps/backend/src/auth/lib/refresh-token.test.ts`

**Interfaces:**
- Consumes: `safeEqual` from `./safe-compare.js` (Task 2).
- Produces: `generateRefreshToken(): string`, `hashRefreshToken(token: string): string`, `verifyRefreshToken(token: string, hash: string): boolean`. Plan 2's `token.service.ts` will call all three.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/lib/refresh-token.test.ts
import { describe, it, expect } from 'vitest'
import { generateRefreshToken, hashRefreshToken, verifyRefreshToken } from './refresh-token.js'

describe('generateRefreshToken', () => {
  it('gera uma string base64url de 32 bytes de entropia (43 chars, sem padding)', () => {
    const token = generateRefreshToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('gera tokens diferentes a cada chamada', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken())
  })
})

describe('hashRefreshToken', () => {
  it('é determinístico para o mesmo input', () => {
    const token = generateRefreshToken()
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
  })

  it('produz um hex de 64 caracteres (SHA-256)', () => {
    expect(hashRefreshToken('qualquer-coisa')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produz hashes diferentes para inputs diferentes', () => {
    expect(hashRefreshToken('a')).not.toBe(hashRefreshToken('b'))
  })
})

describe('verifyRefreshToken', () => {
  it('retorna true quando o token corresponde ao hash', () => {
    const token = generateRefreshToken()
    const hash = hashRefreshToken(token)
    expect(verifyRefreshToken(token, hash)).toBe(true)
  })

  it('retorna false quando o token não corresponde ao hash', () => {
    const hash = hashRefreshToken(generateRefreshToken())
    expect(verifyRefreshToken('token-errado', hash)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- refresh-token.test.ts`
Expected: FAIL — `Cannot find module './refresh-token.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/lib/refresh-token.ts
import { randomBytes, createHash } from 'node:crypto'
import { safeEqual } from './safe-compare.js'

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyRefreshToken(token: string, hash: string): boolean {
  return safeEqual(hashRefreshToken(token), hash)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- refresh-token.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/lib/refresh-token.ts apps/backend/src/auth/lib/refresh-token.test.ts
git commit -m "test+feat(backend): add opaque refresh token generation/hashing"
```

---

## Task 4: `auth/lib/totp.ts`

**Files:**
- Create: `apps/backend/src/auth/lib/totp.ts`
- Test: `apps/backend/src/auth/lib/totp.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `generateTotpSecret(): string`, `totp(secret: string, timestampMs?: number, stepSeconds?: number): string`, `verifyTotp(secret: string, code: string, timestampMs?: number, stepSeconds?: number): boolean`, `buildOtpauthUrl(params: { secret: string; email: string; issuer: string }): string`. Task 8 (`mfa.service.ts`) wraps all four.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/lib/totp.test.ts
import { describe, it, expect } from 'vitest'
import { generateTotpSecret, totp, verifyTotp, buildOtpauthUrl } from './totp.js'

describe('generateTotpSecret', () => {
  it('gera um secret em base32 (apenas A-Z e 2-7)', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
  })

  it('gera secrets diferentes a cada chamada', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret())
  })
})

describe('totp', () => {
  it('é determinístico para o mesmo secret e o mesmo instante', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(totp(secret, now)).toBe(totp(secret, now))
  })

  it('produz um código de 6 dígitos', () => {
    const secret = generateTotpSecret()
    expect(totp(secret, Date.now())).toMatch(/^\d{6}$/)
  })

  it('muda de código entre janelas de 30s diferentes', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    expect(totp(secret, t0)).not.toBe(totp(secret, t0 + 30_000))
  })
})

describe('verifyTotp', () => {
  it('aceita o código gerado no instante exato', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true)
  })

  it('aceita o código da janela anterior (drift -1)', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    const codePrevious = totp(secret, t0 - 30_000)
    expect(verifyTotp(secret, codePrevious, t0)).toBe(true)
  })

  it('aceita o código da janela seguinte (drift +1)', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    const codeNext = totp(secret, t0 + 30_000)
    expect(verifyTotp(secret, codeNext, t0)).toBe(true)
  })

  it('rejeita um código fora da janela de tolerância (drift -2)', () => {
    const secret = generateTotpSecret()
    const t0 = 1_700_000_000_000
    const codeTooOld = totp(secret, t0 - 60_000)
    expect(verifyTotp(secret, codeTooOld, t0)).toBe(false)
  })

  it('rejeita um código inválido', () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(secret, '000000', Date.now())).toBe(false)
  })
})

describe('buildOtpauthUrl', () => {
  it('monta a URL otpauth com issuer e email codificados', () => {
    const url = buildOtpauthUrl({ secret: 'ABCD1234', email: 'admin@acme.com', issuer: 'wz-connect' })
    expect(url).toBe(
      'otpauth://totp/wz-connect%3Aadmin%40acme.com?secret=ABCD1234&issuer=wz-connect&algorithm=SHA1&digits=6&period=30'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- totp.test.ts`
Expected: FAIL — `Cannot find module './totp.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/lib/totp.ts
import { createHmac, randomBytes } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20))
}

function encodeBase32(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: string, counter: number): string {
  const key = decodeBase32(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

export function totp(secret: string, timestampMs: number = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds)
  return hotp(secret, counter)
}

export function verifyTotp(
  secret: string,
  code: string,
  timestampMs: number = Date.now(),
  stepSeconds = 30
): boolean {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds)
  for (const drift of [-1, 0, 1]) {
    if (hotp(secret, counter + drift) === code) {
      return true
    }
  }
  return false
}

export function buildOtpauthUrl(params: { secret: string; email: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.email}`)
  const issuer = encodeURIComponent(params.issuer)
  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- totp.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/lib/totp.ts apps/backend/src/auth/lib/totp.test.ts
git commit -m "test+feat(backend): add pure-Node RFC 6238 TOTP implementation"
```

---

## Task 5: `auth/services/password.service.ts`

**Files:**
- Create: `apps/backend/src/auth/services/password.service.ts`
- Test: `apps/backend/src/auth/services/password.service.test.ts`

**Interfaces:**
- Consumes: `bcryptjs` (already a dependency of `@wz/connect-backend`).
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`. Used by onboarding/login services in later plans.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/services/password.service.test.ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.service.js'

describe('hashPassword', () => {
  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const a = await hashPassword('senha-forte-123')
    const b = await hashPassword('senha-forte-123')
    expect(a).not.toBe(b)
  })

  it('gera um hash no formato bcrypt ($2a$/$2b$)', async () => {
    const hash = await hashPassword('senha-forte-123')
    expect(hash).toMatch(/^\$2[aby]\$/)
  })
})

describe('verifyPassword', () => {
  it('aceita a senha correta contra seu próprio hash', async () => {
    const hash = await hashPassword('senha-forte-123')
    expect(await verifyPassword('senha-forte-123', hash)).toBe(true)
  })

  it('rejeita uma senha errada', async () => {
    const hash = await hashPassword('senha-forte-123')
    expect(await verifyPassword('senha-errada', hash)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- password.service.test.ts`
Expected: FAIL — `Cannot find module './password.service.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/services/password.service.ts
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- password.service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/services/password.service.ts apps/backend/src/auth/services/password.service.test.ts
git commit -m "test+feat(backend): add bcryptjs password hashing service"
```

---

## Task 6: `auth/services/lockout.service.ts`

**Files:**
- Create: `apps/backend/src/auth/services/lockout.service.ts`
- Test: `apps/backend/src/auth/services/lockout.service.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions over a plain `LockoutState` shape — no DB access here; the login route in a later plan reads `users.failedLoginCount`/`users.lockedUntil`, calls these functions, and persists the result).
- Produces: `interface LockoutState { failedLoginCount: number; lockedUntil: Date | null }`, `isLocked(state, now?): boolean`, `recordFailure(state, now?): LockoutState`, `recordSuccess(): LockoutState`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/services/lockout.service.test.ts
import { describe, it, expect } from 'vitest'
import { isLocked, recordFailure, recordSuccess } from './lockout.service.js'

describe('isLocked', () => {
  it('retorna false quando lockedUntil é null', () => {
    expect(isLocked({ failedLoginCount: 0, lockedUntil: null })).toBe(false)
  })

  it('retorna true quando lockedUntil está no futuro', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const future = new Date('2026-01-01T00:10:00Z')
    expect(isLocked({ failedLoginCount: 5, lockedUntil: future }, now)).toBe(true)
  })

  it('retorna false quando lockedUntil já passou', () => {
    const now = new Date('2026-01-01T00:31:00Z')
    const past = new Date('2026-01-01T00:00:00Z')
    expect(isLocked({ failedLoginCount: 5, lockedUntil: past }, now)).toBe(false)
  })
})

describe('recordFailure', () => {
  it('incrementa failedLoginCount sem travar antes de 5 tentativas', () => {
    const state = recordFailure({ failedLoginCount: 3, lockedUntil: null })
    expect(state.failedLoginCount).toBe(4)
    expect(state.lockedUntil).toBeNull()
  })

  it('trava por 30 minutos na 5ª tentativa falha', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const state = recordFailure({ failedLoginCount: 4, lockedUntil: null }, now)
    expect(state.failedLoginCount).toBe(5)
    expect(state.lockedUntil).toEqual(new Date('2026-01-01T00:30:00Z'))
  })

  it('mantém o bloqueio (não estende) em tentativas além da 5ª', () => {
    const now = new Date('2026-01-01T00:05:00Z')
    const lockedUntil = new Date('2026-01-01T00:30:00Z')
    const state = recordFailure({ failedLoginCount: 5, lockedUntil }, now)
    expect(state.failedLoginCount).toBe(6)
    expect(state.lockedUntil).toEqual(lockedUntil)
  })
})

describe('recordSuccess', () => {
  it('zera failedLoginCount e limpa lockedUntil', () => {
    expect(recordSuccess()).toEqual({ failedLoginCount: 0, lockedUntil: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- lockout.service.test.ts`
Expected: FAIL — `Cannot find module './lockout.service.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/services/lockout.service.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- lockout.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/services/lockout.service.ts apps/backend/src/auth/services/lockout.service.test.ts
git commit -m "test+feat(backend): add 5-attempts/30min account lockout logic"
```

---

## Task 7: `auth/services/csrf.service.ts`

**Files:**
- Create: `apps/backend/src/auth/services/csrf.service.ts`
- Test: `apps/backend/src/auth/services/csrf.service.test.ts`

**Interfaces:**
- Consumes: `safeEqual` from `../lib/safe-compare.js` (Task 2).
- Produces: `issueCsrfToken(): string`, `verifyCsrfToken(headerToken: string | undefined, cookieToken: string | undefined): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/services/csrf.service.test.ts
import { describe, it, expect } from 'vitest'
import { issueCsrfToken, verifyCsrfToken } from './csrf.service.js'

describe('issueCsrfToken', () => {
  it('gera um token base64url não vazio', () => {
    const token = issueCsrfToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThan(0)
  })

  it('gera tokens diferentes a cada chamada', () => {
    expect(issueCsrfToken()).not.toBe(issueCsrfToken())
  })
})

describe('verifyCsrfToken', () => {
  it('aceita quando header e cookie coincidem', () => {
    const token = issueCsrfToken()
    expect(verifyCsrfToken(token, token)).toBe(true)
  })

  it('rejeita quando header e cookie divergem', () => {
    expect(verifyCsrfToken(issueCsrfToken(), issueCsrfToken())).toBe(false)
  })

  it('rejeita quando o header está ausente', () => {
    expect(verifyCsrfToken(undefined, issueCsrfToken())).toBe(false)
  })

  it('rejeita quando o cookie está ausente', () => {
    expect(verifyCsrfToken(issueCsrfToken(), undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- csrf.service.test.ts`
Expected: FAIL — `Cannot find module './csrf.service.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/services/csrf.service.ts
import { randomBytes } from 'node:crypto'
import { safeEqual } from '../lib/safe-compare.js'

export function issueCsrfToken(): string {
  return randomBytes(24).toString('base64url')
}

export function verifyCsrfToken(headerToken: string | undefined, cookieToken: string | undefined): boolean {
  if (!headerToken || !cookieToken) {
    return false
  }
  return safeEqual(headerToken, cookieToken)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- csrf.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/services/csrf.service.ts apps/backend/src/auth/services/csrf.service.test.ts
git commit -m "test+feat(backend): add CSRF double-submit token service"
```

---

## Task 8: `auth/services/mfa.service.ts`

**Files:**
- Create: `apps/backend/src/auth/services/mfa.service.ts`
- Test: `apps/backend/src/auth/services/mfa.service.test.ts`

**Interfaces:**
- Consumes: `generateTotpSecret`, `verifyTotp`, `buildOtpauthUrl`, `totp` from `../lib/totp.js` (Task 4).
- Produces: `encryptMfaSecret(secret: string, jwtSecret: string, userId: string): string`, `decryptMfaSecret(payload: string, jwtSecret: string, userId: string): string`, `setupMfa(email: string, issuer?: string): { secret: string; otpauthUrl: string }`, `verifyMfaCode(secret: string, code: string): boolean`. The MFA routes in a later plan store `encryptMfaSecret(...)` output in `users.mfa_secret_encrypted` and decrypt it on login/disable.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/services/mfa.service.test.ts
import { describe, it, expect } from 'vitest'
import { encryptMfaSecret, decryptMfaSecret, setupMfa, verifyMfaCode } from './mfa.service.js'
import { totp } from '../lib/totp.js'

const JWT_SECRET = 'segredo-de-teste-com-32-caracteres-no-minimo'
const USER_ID = '11111111-1111-1111-1111-111111111111'

describe('encryptMfaSecret / decryptMfaSecret', () => {
  it('descriptografa de volta para o secret original', () => {
    const encrypted = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    expect(decryptMfaSecret(encrypted, JWT_SECRET, USER_ID)).toBe('SECRETOTOTP')
  })

  it('produz payloads diferentes a cada chamada (IV aleatório)', () => {
    const a = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    const b = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    expect(a).not.toBe(b)
  })

  it('falha ao descriptografar com um userId diferente (chave errada)', () => {
    const encrypted = encryptMfaSecret('SECRETOTOTP', JWT_SECRET, USER_ID)
    expect(() =>
      decryptMfaSecret(encrypted, JWT_SECRET, '22222222-2222-2222-2222-222222222222')
    ).toThrow()
  })
})

describe('setupMfa', () => {
  it('retorna um secret base32 e uma otpauthUrl com o email', () => {
    const { secret, otpauthUrl } = setupMfa('admin@acme.com')
    expect(secret).toMatch(/^[A-Z2-7]+$/)
    expect(otpauthUrl).toContain(encodeURIComponent('admin@acme.com'))
  })
})

describe('verifyMfaCode', () => {
  it('aceita o código TOTP atual do secret', () => {
    const { secret } = setupMfa('admin@acme.com')
    expect(verifyMfaCode(secret, totp(secret))).toBe(true)
  })

  it('rejeita um código incorreto', () => {
    const { secret } = setupMfa('admin@acme.com')
    expect(verifyMfaCode(secret, '000000')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- mfa.service.test.ts`
Expected: FAIL — `Cannot find module './mfa.service.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/services/mfa.service.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { generateTotpSecret, verifyTotp, buildOtpauthUrl } from '../lib/totp.js'

function deriveKey(jwtSecret: string, userId: string): Buffer {
  return scryptSync(jwtSecret, userId, 32)
}

export function encryptMfaSecret(secret: string, jwtSecret: string, userId: string): string {
  const key = deriveKey(jwtSecret, userId)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url')
}

export function decryptMfaSecret(payload: string, jwtSecret: string, userId: string): string {
  const key = deriveKey(jwtSecret, userId)
  const raw = Buffer.from(payload, 'base64url')
  const iv = raw.subarray(0, 12)
  const authTag = raw.subarray(12, 28)
  const encrypted = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function setupMfa(email: string, issuer = 'wz-connect'): { secret: string; otpauthUrl: string } {
  const secret = generateTotpSecret()
  return { secret, otpauthUrl: buildOtpauthUrl({ secret, email, issuer }) }
}

export function verifyMfaCode(secret: string, code: string): boolean {
  return verifyTotp(secret, code)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- mfa.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/services/mfa.service.ts apps/backend/src/auth/services/mfa.service.test.ts
git commit -m "test+feat(backend): add MFA setup/verify with encrypted secret storage"
```

---

## Task 9: `auth/services/entitlements.service.ts` (stub)

**Files:**
- Create: `apps/backend/src/auth/services/entitlements.service.ts`
- Test: `apps/backend/src/auth/services/entitlements.service.test.ts`

**Interfaces:**
- Consumes: `EntitlementsResolver` type from `@wz/shared` (already a workspace dependency of `@wz/connect-backend`, exported via `packages/shared/src/entitlements.ts`).
- Produces: `stubEntitlementsResolver: EntitlementsResolver`. Plan 2's `token.service.ts` calls `stubEntitlementsResolver.getActiveEntitlements(orgId)` to populate the JWT's `products` claim (ADR-0005) until the Frente B implementation is swapped in at integration.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/services/entitlements.service.test.ts
import { describe, it, expect } from 'vitest'
import { stubEntitlementsResolver } from './entitlements.service.js'

describe('stubEntitlementsResolver', () => {
  it('retorna planId null e products vazio para qualquer organizationId', async () => {
    const result = await stubEntitlementsResolver.getActiveEntitlements('qualquer-org-id')
    expect(result).toEqual({ planId: null, products: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- entitlements.service.test.ts`
Expected: FAIL — `Cannot find module './entitlements.service.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/services/entitlements.service.ts
import type { EntitlementsResolver } from '@wz/shared'

export const stubEntitlementsResolver: EntitlementsResolver = {
  async getActiveEntitlements() {
    return { planId: null, products: [] }
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- entitlements.service.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/services/entitlements.service.ts apps/backend/src/auth/services/entitlements.service.test.ts
git commit -m "test+feat(backend): add EntitlementsResolver stub for isolated development"
```

---

## Task 10: `tenancy/resolver.ts`

**Files:**
- Create: `apps/backend/src/tenancy/resolver.ts`
- Test: `apps/backend/src/tenancy/resolver.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks — takes its DB lookup as an injected `OrgLookup`, so no live Postgres is needed to test it.
- Produces: `interface OrgLookup { findBySlug(slug: string): Promise<{ id: string; slug: string } | null> }`, `createOrgResolver(lookup: OrgLookup, ttlMs?: number): { resolveOrgFromHost(host: string): Promise<{id,slug}|null>, invalidate(slug: string): void }`. Plan 2's `tenancy/plugin.ts` will construct the real `OrgLookup` from `db/client.ts` and call `resolveOrgFromHost(request.headers.host)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/tenancy/resolver.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createOrgResolver, type OrgLookup } from './resolver.js'

function makeLookup(result: { id: string; slug: string } | null) {
  const state = { calls: 0 }
  const lookup: OrgLookup = {
    async findBySlug() {
      state.calls++
      return result
    },
  }
  return { lookup, state }
}

describe('resolveOrgFromHost', () => {
  it('extrai o subdomínio do host e resolve via lookup', async () => {
    const { lookup } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup)
    expect(await resolver.resolveOrgFromHost('acme.wz-hub.com')).toEqual({ id: 'org-1', slug: 'acme' })
  })

  it('ignora a porta ao extrair o subdomínio', async () => {
    const { lookup } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup)
    expect(await resolver.resolveOrgFromHost('acme.localhost:3000')).toEqual({ id: 'org-1', slug: 'acme' })
  })

  it('usa cache em chamadas repetidas dentro do TTL (não chama o lookup de novo)', async () => {
    const { lookup, state } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup, 60_000)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    expect(state.calls).toBe(1)
  })

  it('busca de novo após o TTL expirar', async () => {
    vi.useFakeTimers()
    const { lookup, state } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup, 1_000)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    vi.advanceTimersByTime(1_001)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    expect(state.calls).toBe(2)
    vi.useRealTimers()
  })

  it('retorna null quando o slug não existe (sem lançar)', async () => {
    const { lookup } = makeLookup(null)
    const resolver = createOrgResolver(lookup)
    expect(await resolver.resolveOrgFromHost('naoexiste.wz-hub.com')).toBeNull()
  })

  it('invalidate() força nova busca no lookup', async () => {
    const { lookup, state } = makeLookup({ id: 'org-1', slug: 'acme' })
    const resolver = createOrgResolver(lookup)
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    resolver.invalidate('acme')
    await resolver.resolveOrgFromHost('acme.wz-hub.com')
    expect(state.calls).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- resolver.test.ts`
Expected: FAIL — `Cannot find module './resolver.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/tenancy/resolver.ts
export interface OrgLookup {
  findBySlug(slug: string): Promise<{ id: string; slug: string } | null>
}

interface CacheEntry {
  value: { id: string; slug: string } | null
  expiresAt: number
}

const DEFAULT_TTL_MS = 60_000

export function createOrgResolver(lookup: OrgLookup, ttlMs = DEFAULT_TTL_MS) {
  const cache = new Map<string, CacheEntry>()

  return {
    async resolveOrgFromHost(host: string): Promise<{ id: string; slug: string } | null> {
      const slug = host.split(':')[0].split('.')[0]
      const now = Date.now()
      const cached = cache.get(slug)
      if (cached && cached.expiresAt > now) {
        return cached.value
      }
      const value = await lookup.findBySlug(slug)
      cache.set(slug, { value, expiresAt: now + ttlMs })
      return value
    },
    invalidate(slug: string): void {
      cache.delete(slug)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- resolver.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/tenancy/resolver.ts apps/backend/src/tenancy/resolver.test.ts
git commit -m "test+feat(backend): add cached slug-to-organization resolver"
```

---

## Task 11: Full suite + coverage check

**Files:** none created — verification only.

- [ ] **Step 1: Run the full backend suite with coverage**

Run: `pnpm --filter @wz/connect-backend test:coverage`
Expected: all 10 test files pass (63 tests total); coverage ≥85% on lines/functions/branches/statements for every file under `src/` (only `lib/`, `auth/lib/`, `auth/services/`, `tenancy/` have code at this point — all exercised directly by their tests).

- [ ] **Step 2: If any threshold is under 85%, add the missing test case(s) for the uncovered branch, then re-run**

(No fixed code here — whatever branch coverage reports as uncovered gets its own `it(...)` in the corresponding `*.test.ts`, following the same red→green cycle as the tasks above.)

- [ ] **Step 3: Commit if any test file was touched in Step 2**

```bash
git add apps/backend/src
git commit -m "test(backend): close coverage gaps found by full-suite run"
```

---

## What's deliberately NOT in this plan

Per the spec (`docs/superpowers/specs/2026-08-06-connect-parte-a-design.md`), the following depend on a live Postgres and/or Fastify wiring and belong to **Plan 2**:

- The `sessions.organization_id` nullable migration (spec §6.1).
- `token.service.ts` (wires `entitlements.service` + `@fastify/jwt`, needs the `products[]` claim per ADR-0005) and `session.service.ts` (needs a real transaction against `sessions`/`refresh_tokens`).
- `tenancy/plugin.ts` (needs a real `OrgLookup` backed by `db/client.ts`, and the Fastify `preHandler` hook itself).
- `auth/hooks/require-auth.ts` and `require-role.ts`.
- All of `auth/routes/*.ts` (login, mfa-challenge, refresh, logout, me, mfa) and the error handler wiring in `server.ts`.
- Adding `@fastify/cookie` and `@fastify/helmet` to `apps/backend/package.json`.

Once this plan is merged, the next `superpowers:writing-plans` invocation should target Plan 2 using this plan's produced interfaces as its dependency list.
