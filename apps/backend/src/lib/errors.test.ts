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
