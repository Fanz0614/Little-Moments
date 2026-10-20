import { describe, expect, it } from 'vitest';
import { providerJsonSchema, SYSTEM_PROMPT } from '@lm/ai-contracts';
import { backoff, generateCaption } from '../src/generate';
import { FakeClock, FakeModel, config, err, input, ok, text } from './helpers';

function setup(steps: ConstructorParameters<typeof FakeModel>[1], cfg = config) {
  const clock = new FakeClock();
  const model = new FakeModel(clock, steps);
  const run = () => generateCaption(input, { model, clock, config: cfg });
  return { clock, model, run };
}

describe('generateCaption: happy path', () => {
  it('returns the model caption on the first try', async () => {
    const { model, run } = setup([{ reply: ok() }]);
    const r = await run();
    expect(r.status).toBe('ok');
    expect(r.result).toEqual({ title: 'Mia rolls over', caption: 'Mia rolled over all by herself today.' });
    expect(r.attempts).toEqual([{ n: 1, outcome: 'ok', ms: 1000 }]);
    expect(r.usage).toEqual({ input_tokens: 500, output_tokens: 40 });
    expect(model.calls).toHaveLength(1);
  });

  it('sends the system prompt, generated schema, token cap and an 8 s timeout', async () => {
    const { model, run } = setup([{ reply: ok() }]);
    await run();
    const { call, timeoutMs } = model.calls[0]!;
    expect(call.system).toBe(SYSTEM_PROMPT);
    expect(call.schema).toEqual(providerJsonSchema());
    expect(call.maxTokens).toBe(400);
    expect(call.model).toBe('claude-haiku-5-5');
    expect(timeoutMs).toBe(8000);
  });

  it('passes warnings through (fabrication is a warning, not a failure)', async () => {
    const { run } = setup([{ reply: ok('Mia takes her first steps', 'Mia rolled over and took her first steps.') }]);
    const r = await run();
    expect(r.status === 'ok' && r.warnings).toEqual([{ code: 'possible_fabrication', terms: ['first'] }]);
  });
});

describe('generateCaption: corrective rewrite', () => {
  const tooLong = ok('Mia rolls over for the very first time this sunny Tuesday morning', 'Mia rolled over.');

  it('rewrites once after a schema violation, with the previous reply and the hint', async () => {
    const { model, clock, run } = setup([{ reply: tooLong }, { reply: ok() }]);
    const r = await run();
    expect(r.status).toBe('ok');
    expect(r.attempts.map((a) => a.outcome)).toEqual(['schema_violation', 'ok']);
    const second = model.calls[1]!.call.messages;
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second[1]!.content).toBe(tooLong.content[0]!.text);
    expect(second[2]!.content).toMatch(/The title was \d+ characters; rewrite it in at most 40\./);
    expect(clock.sleeps).toEqual([]); // no backoff before a rewrite
  });

  it('falls back if the rewrite is also invalid (only one rewrite)', async () => {
    const { model, run } = setup([{ reply: tooLong }, { reply: tooLong }, { reply: ok() }]);
    const r = await run();
    expect(r.status === 'fallback' && r.reason).toBe('schema_violation');
    expect(model.calls).toHaveLength(2);
  });

  it('treats invalid JSON as rewritable', async () => {
    const { run } = setup([{ reply: text('Here you go: {title: Mia}') }, { reply: ok() }]);
    expect((await run()).status).toBe('ok');
  });
});

describe('generateCaption: no retry', () => {
  it.each([
    ['refusal', text('{"title":"', 'refusal')],
    ['truncated', text('{"title":"Mia rolls over","caption":"Mia rol', 'max_tokens')],
    ['unexpected_stop', text('', 'tool_use')],
  ] as const)('%s falls back immediately', async (code, reply) => {
    const { model, run } = setup([{ reply }, { reply: ok() }]);
    const r = await run();
    expect(r.status === 'fallback' && r.reason).toBe(code);
    expect(model.calls).toHaveLength(1);
  });

  it.each([
    ['bad_request', 400],
    ['unauthorized', 401],
  ] as const)('%s (HTTP %i) falls back immediately', async (code, status) => {
    const { model, run } = setup([{ error: err(code, status) }, { reply: ok() }]);
    const r = await run();
    expect(r.status === 'fallback' && r.reason).toBe(code);
    expect(model.calls).toHaveLength(1);
  });
});

describe('generateCaption: transient errors', () => {
  it('retries a 529 with backoff and succeeds', async () => {
    const { clock, run } = setup([{ error: err('overloaded', 529) }, { reply: ok() }]);
    const r = await run();
    expect(r.status).toBe('ok');
    expect(r.attempts.map((a) => a.outcome)).toEqual(['overloaded', 'ok']);
    expect(clock.sleeps).toEqual([375]); // base 500, equal jitter at random=0.5
  });

  it('honours retry-after when it fits the budget', async () => {
    const { clock, run } = setup([{ error: err('rate_limited', 429, 2000) }, { reply: ok() }]);
    expect((await run()).status).toBe('ok');
    expect(clock.sleeps).toEqual([2000]);
  });

  it('falls back at once when retry-after does not fit the budget (no pointless waiting)', async () => {
    const { clock, model, run } = setup([{ error: err('rate_limited', 429, 30_000) }, { reply: ok() }]);
    const r = await run();
    expect(r.status === 'fallback' && r.reason).toBe('rate_limited');
    expect(clock.sleeps).toEqual([]);
    expect(model.calls).toHaveLength(1);
  });

  it('stops after 3 calls in total', async () => {
    const { model, run } = setup([
      { error: err('upstream_error', 500) },
      { error: err('upstream_error', 502) },
      { error: err('upstream_error', 503) },
      { reply: ok() },
    ]);
    const r = await run();
    expect(r.status === 'fallback' && r.reason).toBe('upstream_error');
    expect(model.calls).toHaveLength(3);
  });

  it('keeps the whole request inside the 12 s budget even when calls hang', async () => {
    const { clock, model, run } = setup([
      { error: err('timeout'), latencyMs: 8000 },
      { error: err('timeout'), latencyMs: 8000 },
      { reply: ok() },
    ]);
    const start = clock.now();
    const r = await run();
    expect(r.status === 'fallback' && r.reason).toBe('timeout');
    expect(clock.now() - start).toBeLessThanOrEqual(12_000);
    // first call gets 8 s; the second only gets what is left of the budget
    expect(model.calls.map((c) => c.timeoutMs)).toEqual([8000, 12_000 - 8000 - 375]);
  });

  it('a rewrite and a transient retry can share the 3 calls', async () => {
    const { run } = setup([
      { reply: ok('Mia rolls over for the very first time this sunny Tuesday morning', '') },
      { error: err('overloaded', 529) },
      { reply: ok() },
    ]);
    const r = await run();
    expect(r.status).toBe('ok');
    expect(r.attempts.map((a) => a.outcome)).toEqual(['schema_violation', 'overloaded', 'ok']);
  });
});

describe('generateCaption: fallback content', () => {
  it('uses nickname · age and the user note', async () => {
    const { run } = setup([{ reply: text('{', 'refusal') }]);
    expect((await run()).result).toEqual({ title: 'Mia · 3 months 12 days', caption: input.note });
  });
});

describe('backoff', () => {
  it('grows exponentially with jitter and is capped', () => {
    const c = { backoffBaseMs: 500, backoffMaxMs: 4000 };
    const lo = { random: () => 0 };
    const hi = { random: () => 1 };
    expect([1, 2, 3, 4, 5].map((n) => backoff(n, c, lo))).toEqual([250, 500, 1000, 2000, 2000]);
    expect([1, 2, 3, 4, 5].map((n) => backoff(n, c, hi))).toEqual([500, 1000, 2000, 4000, 4000]);
  });
});
