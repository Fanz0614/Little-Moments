import {
  LIMITS,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildMessages,
  fallbackCaption,
  interpret,
  isRetryable,
  providerJsonSchema,
  type CaptionInput,
  type CaptionOutput,
  type ErrorCode,
  type Warning,
} from '@lm/ai-contracts';
import type { Config } from './config';
import { ProviderError, type ModelClient } from './model';

export type Clock = {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** 0..1, injectable so backoff jitter is deterministic in tests. */
  random(): number;
};

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: Math.random,
};

/** One line per model call, for logs. Never contains user text. */
export type AttemptRecord = { n: number; outcome: 'ok' | ErrorCode; ms: number; detail?: string };

export type GenerateResult =
  | { status: 'ok'; result: CaptionOutput; warnings: Warning[] }
  | { status: 'fallback'; result: CaptionOutput; reason: ErrorCode };

export type GenerateReport = GenerateResult & {
  attempts: AttemptRecord[];
  model?: string;
  usage: { input_tokens: number; output_tokens: number };
};

/** Content problems a rewrite can fix; at most one corrective retry per request. */
const REWRITABLE: ReadonlySet<ErrorCode> = new Set(['schema_violation', 'invalid_json']);

type Deps = { model: ModelClient; clock: Clock; config: Config };

/**
 * Call the model with the agreed retry policy and always return a usable caption.
 *
 * - at most `maxAttempts` calls, all inside `budgetMs`; each call gets
 *   min(attemptTimeoutMs, time left); no call starts with < minAttemptMs left
 * - transient errors: exponential backoff with jitter, or retry-after if sent
 *   (if retry-after doesn't fit the budget, fall back now instead of waiting)
 * - schema_violation / invalid_json: one rewrite with the model's previous reply + hint
 * - refusal / truncated / bad_request / unauthorized: no retry
 */
export async function generateCaption(input: CaptionInput, { model, clock, config }: Deps): Promise<GenerateReport> {
  const start = clock.now();
  const deadline = start + config.budgetMs;
  const attempts: AttemptRecord[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let servedBy: string | undefined;
  let rewrite: { previousReply: string; hint: string } | undefined;
  let rewriteUsed = false;
  let transientFailures = 0;
  let lastCode: ErrorCode = 'timeout';

  const fallback = (reason: ErrorCode): GenerateReport => ({
    status: 'fallback',
    result: fallbackCaption(input),
    reason,
    attempts,
    model: servedBy,
    usage,
  });

  while (attempts.length < config.maxAttempts) {
    const remaining = deadline - clock.now();
    if (remaining < config.minAttemptMs) break;

    const n = attempts.length + 1;
    const t0 = clock.now();
    let reply;
    try {
      reply = await model.create(
        {
          model: config.model,
          system: SYSTEM_PROMPT,
          messages: buildMessages(input, rewrite),
          maxTokens: LIMITS.maxOutputTokens,
          schema: providerJsonSchema() as Record<string, unknown>,
        },
        { timeoutMs: Math.min(config.attemptTimeoutMs, remaining) },
      );
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError('network', String(e));
      attempts.push({ n, outcome: err.code, ms: clock.now() - t0, detail: err.status ? `HTTP ${err.status}` : undefined });
      lastCode = err.code;
      if (!isRetryable(err.code)) return fallback(err.code);

      transientFailures += 1;
      const delay = err.retryAfterMs ?? backoff(transientFailures, config, clock);
      // Not worth waiting if the next attempt couldn't fit afterwards.
      if (clock.now() + delay + config.minAttemptMs > deadline) return fallback(err.code);
      await clock.sleep(delay);
      continue;
    }

    servedBy = reply.model ?? servedBy;
    if (reply.usage) {
      usage.input_tokens += reply.usage.input_tokens;
      usage.output_tokens += reply.usage.output_tokens;
    }

    const r = interpret(reply, input.note);
    if (r.ok) {
      attempts.push({ n, outcome: 'ok', ms: clock.now() - t0 });
      return { status: 'ok', result: r.output, warnings: r.warnings, attempts, model: servedBy, usage };
    }

    attempts.push({ n, outcome: r.code, ms: clock.now() - t0, detail: r.detail });
    lastCode = r.code;
    if (!isRetryable(r.code) || !REWRITABLE.has(r.code) || rewriteUsed) return fallback(r.code);
    rewriteUsed = true;
    rewrite = {
      previousReply: reply.content.map((b) => b.text ?? '').join(''),
      hint: r.retryHint ?? 'Return exactly the fields "title" and "caption" as described.',
    };
  }

  return fallback(lastCode);
}

/** Exponential with "equal jitter": half fixed, half random, capped. */
export function backoff(failureCount: number, config: Pick<Config, 'backoffBaseMs' | 'backoffMaxMs'>, clock: Pick<Clock, 'random'>): number {
  const exp = Math.min(config.backoffMaxMs, config.backoffBaseMs * 2 ** (failureCount - 1));
  return Math.round(exp / 2 + clock.random() * (exp / 2));
}

export { PROMPT_VERSION };
