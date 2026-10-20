/**
 * Storage behind quotas and idempotency. In-memory implementations are enough
 * for a single local process. When deployed, swap in Durable Objects (Workers)
 * or Redis (multi-instance Node) behind the same interfaces — not KV: it is
 * eventually consistent, so it can neither lock nor count accurately.
 */

export type QuotaDecision = { allowed: true } | { allowed: false; scope: 'device' | 'global' };

export interface QuotaStore {
  /** Count one request for this device today, unless a limit is already reached. */
  consume(deviceKey: string, day: string): Promise<QuotaDecision>;
}

export interface IdempotencyStore<T> {
  /**
   * Run `fn` once per key within the TTL. A concurrent or later call with the
   * same key gets the same result (or waits for the in-flight one) instead of
   * calling the model again. Failed runs are not cached.
   */
  once(key: string, fn: () => Promise<T>): Promise<{ value: T; replayed: boolean }>;
}

export class MemoryQuotaStore implements QuotaStore {
  private day = '';
  private perDevice = new Map<string, number>();
  private global = 0;

  constructor(
    private readonly perDeviceLimit: number,
    private readonly globalLimit: number,
  ) {}

  async consume(deviceKey: string, day: string): Promise<QuotaDecision> {
    if (day !== this.day) {
      this.day = day;
      this.perDevice.clear();
      this.global = 0;
    }
    if (this.global >= this.globalLimit) return { allowed: false, scope: 'global' };
    const used = this.perDevice.get(deviceKey) ?? 0;
    if (used >= this.perDeviceLimit) return { allowed: false, scope: 'device' };
    this.perDevice.set(deviceKey, used + 1);
    this.global += 1;
    return { allowed: true };
  }
}

export class MemoryIdempotencyStore<T> implements IdempotencyStore<T> {
  private entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  async once(key: string, fn: () => Promise<T>): Promise<{ value: T; replayed: boolean }> {
    this.evict();
    const hit = this.entries.get(key);
    if (hit) return { value: await hit.promise, replayed: true };

    const promise = fn();
    this.entries.set(key, { promise, expiresAt: this.now() + this.ttlMs });
    try {
      return { value: await promise, replayed: false };
    } catch (e) {
      this.entries.delete(key); // don't cache failures; a retry should really retry
      throw e;
    }
  }

  private evict() {
    const t = this.now();
    for (const [k, v] of this.entries) if (v.expiresAt <= t) this.entries.delete(k);
    // Hard cap so a flood of unique ids can't grow memory without bound.
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** UTC calendar day; quotas reset at 00:00 UTC (11:00 in Sydney). */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
