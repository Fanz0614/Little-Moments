import { z } from 'zod';

/**
 * Every way a caption request can fail. The API retries only `retryable`
 * codes (step 3); everything ends in a fallback caption, never an error screen.
 */
export const ErrorCode = z.enum([
  'refusal', // stop_reason "refusal"
  'truncated', // stop_reason "max_tokens": our token budget is wrong, retrying won't help
  'invalid_json', // text block is not JSON (should not happen with structured outputs)
  'schema_violation', // JSON parsed but failed CaptionOutput (missing field, too long, ...)
  'unexpected_stop', // any other stop_reason, or no text block
  'rate_limited', // 429
  'overloaded', // 529
  'upstream_error', // other 5xx
  'timeout',
  'network',
  'quota_exceeded', // our own per-device daily quota
  'bad_request', // 400/404/413: our bug
  'unauthorized', // 401/403: key/config problem
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'invalid_json',
  'schema_violation',
  'rate_limited',
  'overloaded',
  'upstream_error',
  'timeout',
  'network',
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE.has(code);
}

/** Codes that mean the system is misconfigured and someone should be alerted. */
export function isAlertWorthy(code: ErrorCode): boolean {
  return code === 'truncated' || code === 'bad_request' || code === 'unauthorized';
}

/** Map an HTTP status from the model provider to an error code. */
export function classifyHttpStatus(status: number): ErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 529) return 'overloaded';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status >= 500) return 'upstream_error';
  return 'bad_request';
}
