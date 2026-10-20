import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { toProviderError } from '../src/anthropic';
import { ConfigError, loadConfig } from '../src/config';
import { parseRetryAfter } from '../src/model';
import { MemoryIdempotencyStore, MemoryQuotaStore, utcDay } from '../src/stores';

const headers = (h: Record<string, string>) => new Headers(h);

describe('toProviderError (SDK errors -> our codes)', () => {
  it('maps HTTP errors by status and keeps retry-after', () => {
    const e = toProviderError(Anthropic.APIError.generate(429, { error: { message: 'slow down' } }, 'slow down', headers({ 'retry-after': '3' })));
    expect(e).toMatchObject({ code: 'rate_limited', status: 429, retryAfterMs: 3000 });
    expect(toProviderError(Anthropic.APIError.generate(529, {}, 'overloaded', headers({})))).toMatchObject({ code: 'overloaded' });
    expect(toProviderError(Anthropic.APIError.generate(401, {}, 'bad key', headers({})))).toMatchObject({ code: 'unauthorized' });
    expect(toProviderError(Anthropic.APIError.generate(400, {}, 'bad schema', headers({})))).toMatchObject({ code: 'bad_request' });
  });

  it('distinguishes timeouts from other connection errors', () => {
    expect(toProviderError(new Anthropic.APIConnectionTimeoutError())).toMatchObject({ code: 'timeout' });
    expect(toProviderError(new Anthropic.APIConnectionError({ message: 'ECONNRESET' }))).toMatchObject({ code: 'network' });
  });

  it('treats anything unknown as a network error', () => {
    expect(toProviderError(new Error('boom'))).toMatchObject({ code: 'network' });
  });
});

describe('parseRetryAfter', () => {
  const now = Date.UTC(2026, 9, 20, 12, 0, 0);
  it('prefers retry-after-ms, then seconds, then an HTTP date', () => {
    expect(parseRetryAfter(headers({ 'retry-after-ms': '1500', 'retry-after': '9' }), now)).toBe(1500);
    expect(parseRetryAfter(headers({ 'retry-after': '2' }), now)).toBe(2000);
    expect(parseRetryAfter(headers({ 'retry-after': new Date(now + 4000).toUTCString() }), now)).toBe(4000);
    expect(parseRetryAfter(headers({}), now)).toBeUndefined();
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('fails fast without an API key', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '  ' })).toThrow(/ANTHROPIC_API_KEY/);
  });
  it('applies defaults and overrides', () => {
    const c = loadConfig({ ANTHROPIC_API_KEY: 'k', PER_DEVICE_DAILY_LIMIT: '5' });
    expect(c).toMatchObject({ model: 'claude-haiku-5-5', budgetMs: 12_000, attemptTimeoutMs: 8_000, perDeviceDailyLimit: 5, globalDailyLimit: 1000 });
  });
  it('rejects nonsense numbers', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'k', PORT: 'abc' })).toThrow(/PORT/);
  });
});

describe('MemoryQuotaStore', () => {
  it('resets each UTC day', async () => {
    const q = new MemoryQuotaStore(1, 10);
    expect(await q.consume('d', '2026-10-20')).toEqual({ allowed: true });
    expect(await q.consume('d', '2026-10-20')).toEqual({ allowed: false, scope: 'device' });
    expect(await q.consume('d', '2026-10-21')).toEqual({ allowed: true });
  });
  it('utcDay uses UTC, not local time', () => {
    // 2026-10-20 23:30 in Sydney (UTC+11) is still the 20th... in UTC it's 12:30 on the 20th
    expect(utcDay(Date.UTC(2026, 9, 20, 12, 30))).toBe('2026-10-20');
  });
});

describe('MemoryIdempotencyStore', () => {
  it('does not cache failures', async () => {
    const s = new MemoryIdempotencyStore<number>(60_000);
    await expect(s.once('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await s.once('k', async () => 2)).toEqual({ value: 2, replayed: false });
  });
  it('expires entries after the TTL', async () => {
    let t = 0;
    const s = new MemoryIdempotencyStore<number>(1000, () => t);
    await s.once('k', async () => 1);
    t = 1001;
    expect(await s.once('k', async () => 2)).toEqual({ value: 2, replayed: false });
  });
  it('caps memory', async () => {
    const s = new MemoryIdempotencyStore<number>(60_000, Date.now, 3);
    for (let i = 0; i < 5; i++) await s.once(`k${i}`, async () => i);
    expect(await s.once('k0', async () => 99)).toEqual({ value: 99, replayed: false }); // evicted
    expect(await s.once('k4', async () => 99)).toEqual({ value: 4, replayed: true });
  });
});
