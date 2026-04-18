export const ErrorCodes = {
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  ALL_FALLBACKS_FAILED: 'ALL_FALLBACKS_FAILED',
  INVALID_TASK: 'INVALID_TASK',
  TIMEOUT: 'TIMEOUT',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNSUPPORTED_TASK: 'UNSUPPORTED_TASK',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class RouterError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'RouterError';
    this.code = code;
  }
}
