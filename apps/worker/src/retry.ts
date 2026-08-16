import { CollectorError } from "./collector";

const TRANSIENT_CODES = new Set(["NETWORK_ERROR", "RATE_LIMITED", "UPSTREAM_ERROR"]);

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

export async function collectWithRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000 } = options;
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!(error instanceof CollectorError) || !TRANSIENT_CODES.has(error.code) || attempt === maxAttempts - 1)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw last;
}
