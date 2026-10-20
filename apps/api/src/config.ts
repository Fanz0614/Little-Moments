/**
 * All tunables in one place. Timing values are provisional (agreed: 12 s total,
 * 8 s per call) and should be revisited with real latency data from `pnpm smoke`.
 */
export type Config = {
  anthropicApiKey: string;
  model: string;
  port: number;
  /** 127.0.0.1 by default; set HOST=0.0.0.0 to let a phone on the same Wi-Fi reach it. */
  host: string;
  /** Total wall-clock budget for one caption request, all attempts included. */
  budgetMs: number;
  /** Timeout for a single model call (capped by what's left of the budget). */
  attemptTimeoutMs: number;
  /** Don't start an attempt with less time than this left; fall back instead. */
  minAttemptMs: number;
  /** Model calls per request: first try + 2 retries. */
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  perDeviceDailyLimit: number;
  globalDailyLimit: number;
  idempotencyTtlMs: number;
};

export const DEFAULTS: Omit<Config, 'anthropicApiKey'> = {
  model: 'claude-haiku-5-5',
  port: 8787,
  host: '127.0.0.1',
  budgetMs: 12_000,
  attemptTimeoutMs: 8_000,
  minAttemptMs: 1_500,
  maxAttempts: 3,
  backoffBaseMs: 500,
  backoffMaxMs: 4_000,
  perDeviceDailyLimit: 30,
  globalDailyLimit: 1_000,
  idempotencyTtlMs: 5 * 60_000,
};

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Fails fast at startup instead of on the first request. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not set. Copy apps/api/.env.example to apps/api/.env and add your key.');
  const int = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new ConfigError(`${name} must be a positive integer, got "${raw}"`);
    return n;
  };
  return {
    ...DEFAULTS,
    anthropicApiKey: key,
    model: env.CAPTION_MODEL?.trim() || DEFAULTS.model,
    port: int('PORT', DEFAULTS.port),
    host: env.HOST?.trim() || DEFAULTS.host,
    perDeviceDailyLimit: int('PER_DEVICE_DAILY_LIMIT', DEFAULTS.perDeviceDailyLimit),
    globalDailyLimit: int('GLOBAL_DAILY_LIMIT', DEFAULTS.globalDailyLimit),
  };
}
