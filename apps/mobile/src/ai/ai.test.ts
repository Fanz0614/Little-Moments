import { describe, expect, it } from 'vitest';
import { requestCaption, warningTerms } from './client';
import { editDistance, editRatio } from './editDistance';
import { appendStarter, buildCaptionInput } from './input';

const ids = { requestId: '7d3c8a0e-2f4b-4c1d-9e8f-1a2b3c4d5e6f', deviceId: '0b6f2a7c-6a39-4b7e-9c55-3f1d2e8a9b10' };
const input = { nickname: 'Noah', ageText: '9 months', note: 'pulled himself up on the couch', photoCount: 3, pronoun: 'he' as const };
const meta = { requestId: ids.requestId, promptVersion: 'caption@5', latencyMs: 900, attempts: 1 };

const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('buildCaptionInput', () => {
  it('sends nickname, age text and pronoun, never the full name or birthday', () => {
    const baby = { nickname: 'Mia', birthday: '2026-07-07', gender: 'girl' as const, name: 'Mia Zhang' };
    const out = buildCaptionInput(baby, '2026-10-19', '  rolled over  ', 3);
    expect(out).toEqual({ nickname: 'Mia', ageText: '3 months 12 days', note: 'rolled over', photoCount: 3, pronoun: 'she' });
    expect(JSON.stringify(out)).not.toContain('Zhang');
    expect(JSON.stringify(out)).not.toContain('2026-07-07');
  });

  it('maps unspecified gender to "they"', () => {
    expect(buildCaptionInput({ nickname: 'Kai', birthday: '2026-03-01', gender: 'unspecified' }, '2026-10-01', 'x', 3).pronoun).toBe('they');
  });
});

describe('appendStarter', () => {
  it.each([
    ['', 'Today ', 'Today '],
    ['park', 'With ', 'park. With '],
    ['a quiet day.', 'With ', 'a quiet day. With '],
    ['sleepy   ', 'Today ', 'sleepy. Today '],
  ])('%j + %j -> %j', (note, starter, expected) => {
    expect(appendStarter(note, starter)).toBe(expected);
  });
});

describe('requestCaption', () => {
  it('returns the suggestion and warnings on ok', async () => {
    const r = await requestCaption(input, ids, {
      fetch: respond(200, {
        status: 'ok',
        result: { title: 'Noah pulls up', caption: 'Noah pulled himself up on the couch for the first time.' },
        warnings: [{ code: 'possible_fabrication', terms: ['first'] }],
        meta,
      }),
    });
    expect(r.kind).toBe('ok');
    expect(r.kind === 'ok' && warningTerms(r.warnings)).toEqual(['first']);
  });

  it('sends the device id and a validated body', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    await requestCaption({ ...input, fullName: 'Noah Smith' } as typeof input, ids, {
      baseUrl: 'http://api.test',
      fetch: async (url, init) => {
        seen = { url: String(url), init: init! };
        return new Response('{}', { status: 200 });
      },
    });
    expect(seen!.url).toBe('http://api.test/v1/captions');
    expect((seen!.init.headers as Record<string, string>)['x-device-id']).toBe(ids.deviceId);
    expect(String(seen!.init.body)).not.toContain('Smith');
  });

  it.each([
    ['server fallback', respond(200, { status: 'fallback', result: { title: 'Noah · 9 months', caption: 'x' }, reason: 'timeout', meta }), 'timeout'],
    ['empty caption', respond(200, { status: 'ok', result: { title: 'Noah at 9 months', caption: '' }, warnings: [], meta }), 'empty_caption'],
    ['400', respond(400, { error: 'invalid_request' }), 'http_400'],
    ['malformed body', respond(200, { hello: 1 }), 'bad_response'],
    [
      'network error',
      async () => {
        throw new TypeError('Network request failed');
      },
      'network',
    ],
  ])('%s -> unavailable (%s)', async (_, fetchImpl, reason) => {
    const r = await requestCaption(input, ids, { fetch: fetchImpl as typeof fetch });
    expect(r).toMatchObject({ kind: 'unavailable', reason });
  });

  it('times out on the client', async () => {
    const hang: typeof fetch = (_, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const r = await requestCaption(input, ids, { fetch: hang, timeoutMs: 10 });
    expect(r).toMatchObject({ kind: 'unavailable', reason: 'timeout' });
  });

  it('does not send a note over the limit', async () => {
    let called = false;
    const r = await requestCaption({ ...input, note: 'x'.repeat(301) }, ids, {
      fetch: async () => {
        called = true;
        return new Response('{}');
      },
    });
    expect(r).toMatchObject({ kind: 'unavailable', reason: 'invalid_request' });
    expect(called).toBe(false);
  });
});

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['abc', 'abc', 0],
    ['kitten', 'sitting', 3],
    ['', 'abc', 3],
    ['🍌🍌', '🍌', 1],
  ])('%j vs %j = %d', (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });

  it('ratio is 0 untouched and 1 fully rewritten', () => {
    expect(editRatio('Noah stood up.', 'Noah stood up.')).toBe(0);
    expect(editRatio('abc', 'xyz')).toBe(1);
    expect(editRatio('', '')).toBe(0);
  });
});
