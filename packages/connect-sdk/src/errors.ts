export class ConnectApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'ConnectApiError'
  }
}

export class InvalidTokenError extends Error {
  constructor(message = 'Token JWT inválido') {
    super(message)
    this.name = 'InvalidTokenError'
  }
}

export class TokenExpiredError extends Error {
  constructor(message = 'Token JWT expirado') {
    super(message)
    this.name = 'TokenExpiredError'
  }
}
