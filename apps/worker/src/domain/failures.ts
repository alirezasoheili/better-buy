export type CollectorCode =
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_FORBIDDEN"
  | "AUTH_REJECTED"
  | "GUEST_AUTH_REJECTED"
  | "UPSTREAM_INVALID_JSON"
  | "UPSTREAM_CHANGED"
  | "INCOMPLETE_PAGINATION"
  | "NO_CAMPAIGNS"
  | "NO_STORES";
export class CollectorError extends Error {
  readonly _tag = "CollectorError";
  constructor(
    readonly code: CollectorCode,
    message: string,
    readonly retryable = false,
    readonly retryAfterMs?: number
  ) {
    super(message);
  }
}
export class PersistenceError extends Error {
  readonly _tag = "PersistenceError";
  readonly code = "PERSISTENCE_ERROR";
  constructor(readonly operation: string) {
    super("ذخیره اطلاعات اسکن ناموفق بود؛ دوباره تلاش کنید.");
  }
}
export class CredentialError extends Error {
  readonly _tag = "CredentialError";
  readonly code = "AUTH_EXPIRED";
  constructor() {
    super("اطلاعات اتصال ذخیره‌شده معتبر نیست.");
  }
}
export class ScanValidationError extends Error {
  readonly _tag = "ScanValidationError";
  constructor(
    readonly code:
      | "LOCATION_NOT_FOUND"
      | "OUTSIDE_TEHRAN"
      | "PROVIDER_UNAVAILABLE"
      | "SCAN_IN_PROGRESS",
    message: string,
    readonly status: 404 | 422 | 409 = 409
  ) {
    super(message);
  }
}
export type ScanFailure =
  CollectorError | CredentialError | PersistenceError | ScanValidationError;
