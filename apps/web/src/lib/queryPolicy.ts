import { RequestFailure } from "./api";
export const MAX_READ_RETRIES = 2;
export const MAX_RETRY_AFTER_MS = 5_000;
export function retryApplicationRead(
  failureCount: number,
  error: unknown
): boolean {
  if (failureCount >= MAX_READ_RETRIES || !(error instanceof RequestFailure))
    return false;
  if ((error.retryAfterMs ?? 0) > MAX_RETRY_AFTER_MS) return false;
  return (
    error.kind === "transport" ||
    (error.kind === "http" &&
      (error.status === 408 ||
        error.status === 429 ||
        (error.status !== undefined &&
          error.status >= 500 &&
          error.status <= 599)))
  );
}
export function readRetryDelay(attempt: number, error: unknown): number {
  const requested =
    error instanceof RequestFailure ? (error.retryAfterMs ?? 0) : 0;
  return Math.min(
    MAX_RETRY_AFTER_MS,
    Math.max(attempt === 0 ? 1_000 : 2_000, requested)
  );
}
// Polling is a new recovery cycle, not an extra layer of rapid retries.
// Permanent errors and long server guidance wait for manual retry/reconnect.
export function recoveryInterval(error: unknown): number | false {
  return retryApplicationRead(0, error) ? 15_000 : false;
}
