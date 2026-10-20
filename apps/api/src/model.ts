import type { ErrorCode, PromptMessage, ProviderMessage } from '@lm/ai-contracts';

export type ModelCall = {
  model: string;
  system: string;
  messages: PromptMessage[];
  maxTokens: number;
  /** Passed as output_config.format.schema. */
  schema: Record<string, unknown>;
};

export type ModelReply = ProviderMessage & {
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
};

/**
 * The only thing the orchestrator knows about the provider. Tests use a fake;
 * production uses the Anthropic SDK adapter. Implementations must NOT retry:
 * all retry policy lives in generate.ts.
 */
export interface ModelClient {
  create(call: ModelCall, opts: { timeoutMs: number }): Promise<ModelReply>;
}

/** Provider failures normalised to our error codes. */
export class ProviderError extends Error {
  override name = 'ProviderError';
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status?: number,
    /** From retry-after / retry-after-ms, when the provider sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** retry-after-ms (ms) wins over retry-after (seconds or HTTP date). */
export function parseRetryAfter(headers: { get(name: string): string | null } | undefined, now: number): number | undefined {
  if (!headers) return undefined;
  const ms = Number(headers.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
