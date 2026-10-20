import { describe, expect, it } from 'vitest';
import { CaptionOutput, findFabricatedMilestones, interpret, isRetryable, normalizeOutput } from '../src';
import { FIXTURES, NOTE } from './fixtures';

const run = (name: keyof typeof FIXTURES, note = NOTE) => interpret(FIXTURES[name], note);

describe('interpret: success paths', () => {
  it('accepts a well-formed reply with no warnings', () => {
    expect(run('ok')).toEqual({
      ok: true,
      output: { title: 'Mia rolls over', caption: 'Mia rolled over all by herself today, and looked so surprised.' },
      warnings: [],
    });
  });

  it('normalises whitespace without changing words', () => {
    const r = run('extraWhitespace');
    expect(r.ok && r.output).toEqual({ title: 'Mia rolls over', caption: 'Mia rolled over. So surprised.' });
  });

  it('strips wrapping quotes and a trailing full stop from the title', () => {
    const r = run('wrappedQuotes');
    expect(r.ok && r.output.title).toBe('Mia rolls over');
  });

  it('turns a newline in the title into a space', () => {
    const r = run('titleNewline');
    expect(r.ok && r.output.title).toBe('Mia rolls over');
  });

  it('accepts a 201–300 character caption untouched, with a long_caption warning', () => {
    const r = run('captionLong');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output.caption.length).toBeGreaterThan(200);
    expect(r.output.caption.length).toBeLessThanOrEqual(300);
    expect(r.output.caption.endsWith('surprised.')).toBe(true); // nothing cut off
    expect(r.warnings).toEqual([{ code: 'long_caption', length: r.output.caption.length }]);
  });

  it('counts characters, not UTF-16 units (150 emoji is 150 characters)', () => {
    expect(run('emojiCaption').ok).toBe(true);
  });
});

describe('interpret: stop reasons are checked before parsing', () => {
  it.each([
    ['refusal', 'refusal'],
    ['truncated', 'truncated'],
    ['toolUse', 'unexpected_stop'],
    ['noText', 'unexpected_stop'],
  ] as const)('%s -> %s (not retryable)', (name, code) => {
    const r = run(name);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe(code);
    expect(isRetryable(r.code)).toBe(false);
  });
});

describe('interpret: malformed content', () => {
  it.each([
    ['invalidJson', 'invalid_json'],
    ['arrayJson', 'schema_violation'],
    ['missingCaption', 'schema_violation'],
    ['extraField', 'schema_violation'],
    ['wrongType', 'schema_violation'],
    ['emptyTitle', 'schema_violation'],
    ['titleTooLong', 'schema_violation'],
    ['captionTooLong', 'schema_violation'],
  ] as const)('%s -> %s', (name, code) => {
    const r = run(name);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });

  it('gives a concrete rewrite hint for a long title', () => {
    const r = run('titleTooLong');
    expect(!r.ok && r.retryHint).toMatch(/The title was \d+ characters; rewrite it in at most 40\./);
  });

  it('asks for the soft limit when the caption is over the hard limit', () => {
    const r = run('captionTooLong');
    expect(!r.ok && r.retryHint).toMatch(/The caption was \d+ characters; rewrite it in at most 200\./);
  });

  it('names the failing field in the log detail', () => {
    const r = run('missingCaption');
    expect(!r.ok && r.detail).toContain('caption');
  });
});

describe('interpret: fabrication warnings', () => {
  it('flags milestones the note never mentioned, but still returns the text', () => {
    const r = run('fabricated');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([{ code: 'possible_fabrication', terms: ['first', 'speaking'] }]);
  });

  it('does not flag a milestone the parent wrote themselves', () => {
    const r = interpret(FIXTURES.fabricated, 'rolled over, then her first steps! and she said mama');
    expect(r.ok && r.warnings).toEqual([]);
  });

  it('matches word forms on both sides ("rolled over" in note, "rolls over" in output)', () => {
    expect(run('ok').ok && run('ok')).toMatchObject({ warnings: [] });
  });
});

describe('fabrication check: reported speech', () => {
  const out = (caption: string) => ({ title: 'Mia', caption });
  it.each([
    ['The look on her face said it all.', []],
    ['Needless to say, it was a good day.', []],
    ['She said "mama" for the first time.', ['first', 'speaking']],
    ['Then she said mama!', ['speaking']],
    ['He says hi to everyone.', ['speaking']],
  ] as const)('%s -> %o', (caption, terms) => {
    expect(findFabricatedMilestones(out(caption), 'a quiet day at home')).toEqual(terms);
  });

  it('does not flag speech the parent wrote down', () => {
    expect(findFabricatedMilestones(out('Then she said mama!'), 'she said mama today')).toEqual([]);
  });
});

describe('normalizeOutput', () => {
  it('leaves non-string values for Zod to reject', () => {
    expect(normalizeOutput({ title: 3, caption: null })).toEqual({ title: 3, caption: null });
  });

  it('every successful output satisfies CaptionOutput', () => {
    for (const name of Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]) {
      const r = run(name);
      if (r.ok) expect(CaptionOutput.safeParse(r.output).success, name).toBe(true);
    }
  });
});
