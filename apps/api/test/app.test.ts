import { describe, expect, it } from 'vitest';
import { CaptionResponse } from '@lm/ai-contracts';
import { createApp, deviceKey, type LogLine } from '../src/app';
import { MemoryIdempotencyStore, MemoryQuotaStore } from '../src/stores';
import { FakeClock, FakeModel, config, err, input, ok } from './helpers';

const DEVICE = '0b6f2a7c-6a39-4b7e-9c55-3f1d2e8a9b10';
const rid = (n: number) => `7d3c8a0e-2f4b-4c1d-9e8f-${String(n).padStart(12, '0')}`;

function setup(steps: ConstructorParameters<typeof FakeModel>[1], limits = { device: 30, global: 1000 }) {
  const clock = new FakeClock();
  const model = new FakeModel(clock, steps);
  const logs: LogLine[] = [];
  const app = createApp({
    config,
    model,
    clock,
    quota: new MemoryQuotaStore(limits.device, limits.global),
    idempotency: new MemoryIdempotencyStore<CaptionResponse>(config.idempotencyTtlMs, clock.now),
    log: (l) => logs.push(l),
  });
  const post = (body: unknown, headers: Record<string, string> = { 'x-device-id': DEVICE }) =>
    app.request('/v1/captions', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { app, model, logs, post, clock };
}

describe('POST /v1/captions', () => {
  it('returns a validated ok response with meta', async () => {
    const { post } = setup([{ reply: ok() }]);
    const res = await post({ requestId: rid(1), input });
    expect(res.status).toBe(200);
    const body = CaptionResponse.parse(await res.json());
    expect(body.status).toBe('ok');
    expect(body.meta).toMatchObject({ requestId: rid(1), promptVersion: 'caption@1', model: 'claude-haiku-5-5', attempts: 1 });
  });

  it('returns 200 with a fallback when the model fails', async () => {
    const { post } = setup([{ error: err('unauthorized', 401) }]);
    const body = CaptionResponse.parse(await (await post({ requestId: rid(1), input })).json());
    expect(body).toMatchObject({ status: 'fallback', reason: 'unauthorized', result: { title: 'Mia · 3 months 12 days' } });
  });

  it('rejects a missing or malformed device id', async () => {
    const { post } = setup([]);
    expect((await post({ requestId: rid(1), input }, {})).status).toBe(400);
    expect((await post({ requestId: rid(1), input }, { 'x-device-id': 'nope' })).status).toBe(400);
  });

  it('rejects an invalid body with field-level issues and never calls the model', async () => {
    const { post, model } = setup([]);
    const res = await post({ requestId: rid(1), input: { ...input, note: 'x'.repeat(301) } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request', issues: [{ path: 'input.note' }] });
    expect(model.calls).toHaveLength(0);
  });

  it('rejects a non-JSON body', async () => {
    const { app } = setup([]);
    const res = await app.request('/v1/captions', { method: 'POST', headers: { 'x-device-id': DEVICE }, body: 'hello' });
    expect(res.status).toBe(400);
  });
});

describe('idempotency', () => {
  it('replays the same response for the same requestId without calling the model again', async () => {
    const { post, model, logs } = setup([{ reply: ok() }]);
    const a = await (await post({ requestId: rid(1), input })).json();
    const b = await (await post({ requestId: rid(1), input })).json();
    expect(b).toEqual(a);
    expect(model.calls).toHaveLength(1);
    expect(logs.map((l) => l.replayed)).toEqual([false, true]);
  });

  it('dedupes concurrent duplicates (one model call)', async () => {
    const { post, model } = setup([{ reply: ok() }]);
    const [a, b] = await Promise.all([post({ requestId: rid(1), input }), post({ requestId: rid(1), input })]);
    expect(await b.json()).toEqual(await a.json());
    expect(model.calls).toHaveLength(1);
  });

  it('scopes request ids per device', async () => {
    const { post, model } = setup([{ reply: ok() }, { reply: ok() }]);
    await post({ requestId: rid(1), input });
    await post({ requestId: rid(1), input }, { 'x-device-id': '1c6f2a7c-6a39-4b7e-9c55-3f1d2e8a9b10' });
    expect(model.calls).toHaveLength(2);
  });
});

describe('quotas', () => {
  it('falls back with quota_exceeded once the device limit is reached, without calling the model', async () => {
    const { post, model } = setup([{ reply: ok() }, { reply: ok() }], { device: 1, global: 100 });
    await post({ requestId: rid(1), input });
    const body = CaptionResponse.parse(await (await post({ requestId: rid(2), input })).json());
    expect(body).toMatchObject({ status: 'fallback', reason: 'quota_exceeded', meta: { attempts: 0 } });
    expect(model.calls).toHaveLength(1);
  });

  it('a replayed request does not use quota twice', async () => {
    const { post } = setup([{ reply: ok() }], { device: 1, global: 100 });
    await post({ requestId: rid(1), input });
    const again = CaptionResponse.parse(await (await post({ requestId: rid(1), input })).json());
    expect(again.status).toBe('ok');
  });

  it('enforces the global cap across devices', async () => {
    const { post } = setup([{ reply: ok() }], { device: 10, global: 1 });
    await post({ requestId: rid(1), input });
    const other = await post({ requestId: rid(2), input }, { 'x-device-id': '1c6f2a7c-6a39-4b7e-9c55-3f1d2e8a9b10' });
    expect(CaptionResponse.parse(await other.json())).toMatchObject({ reason: 'quota_exceeded' });
  });
});

describe('logging', () => {
  it('never logs the note, nickname or generated text', async () => {
    const { post, logs } = setup([{ reply: ok('Mia rolls over', 'Mia rolled over all by herself today.') }]);
    await post({ requestId: rid(1), input });
    const line = JSON.stringify(logs);
    for (const secret of [input.note, 'rolled over', 'Mia', DEVICE]) expect(line).not.toContain(secret);
    expect(logs[0]).toMatchObject({ level: 'info', status: 'ok', lengths: { note: input.note.length, nickname: 3 } });
  });

  it('logs configuration problems at error level', async () => {
    const { post, logs } = setup([{ error: err('unauthorized', 401) }]);
    await post({ requestId: rid(1), input });
    expect(logs[0]?.level).toBe('error');
  });
});

describe('misc', () => {
  it('GET /health reports model and prompt version', async () => {
    const { app } = setup([]);
    expect(await (await app.request('/health')).json()).toEqual({ ok: true, model: 'claude-haiku-5-5', promptVersion: 'caption@1' });
  });

  it('deviceKey is stable, short and not the raw id', async () => {
    const k = await deviceKey(DEVICE);
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(await deviceKey(DEVICE)).toBe(k);
    expect(k).not.toContain(DEVICE.slice(0, 8));
  });
});
