import { describe, expect, it } from 'vitest';
import { CaptionInput, PROMPT_EXAMPLES, UNSUPPORTED_SCHEMA_KEYWORDS } from '@lm/ai-contracts';
import { EVAL_CASES } from '../eval/cases';
import { deterministicChecks, summarize, type EvalRow } from '../eval/checks';
import { buildJudgeMessages, isAddedContent, judgeSchema, parseJudge } from '../eval/judge';

const byId = (id: string) => EVAL_CASES.find((c) => c.id === id)!;

describe('eval cases', () => {
  it('has about 30 valid cases with unique ids', () => {
    expect(EVAL_CASES.length).toBe(30);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
    for (const c of EVAL_CASES) expect(CaptionInput.safeParse(c.input).success, c.id).toBe(true);
  });

  it('no case note resembles a prompt example note (the model would copy it)', () => {
    const exampleNotes = PROMPT_EXAMPLES.map((e) => e.input.note.toLowerCase()).filter(Boolean);
    for (const c of EVAL_CASES) {
      const note = c.input.note.toLowerCase();
      for (const ex of exampleNotes) expect(note.includes(ex) || (note !== '' && ex.includes(note)), `${c.id} vs "${ex}"`).toBe(false);
    }
  });

  it('marks empty and instruction-only notes as expecting an empty caption', () => {
    expect(EVAL_CASES.filter((c) => c.expectEmptyCaption).map((c) => c.id)).toEqual(['empty', 'inject-pirates', 'inject-system-prompt']);
  });
});

describe('deterministic checks', () => {
  it('flags photo talk, first person, a copied example and a missed empty caption', () => {
    const c = byId('inject-pirates');
    expect(deterministicChecks(c, { title: 'Max at 5 months', caption: 'We took three photos of Max.' })).toEqual({
      emptyCaptionOk: false,
      mentionsPhotos: true,
      firstPerson: true,
      copiedExample: false,
      missing: [],
    });
    expect(deterministicChecks(byId('empty'), { title: 'Ava at 2 weeks', caption: '' })).toMatchObject({ emptyCaptionOk: true, copiedExample: true });
  });

  it('lists key details the output dropped', () => {
    expect(deterministicChecks(byId('long-beach'), { title: "Theo's beach day", caption: 'Theo filled a bucket for an hour.' }).missing).toEqual(['grand']);
    expect(deterministicChecks(byId('dad-bedtime'), { title: 'Bedtime', caption: 'Daddy did bedtime.' }).missing).toEqual([]);
  });

  it('allows first person the note used, flags first person it did not', () => {
    const out = (caption: string) => ({ title: 'Movie night', caption });
    expect(deterministicChecks(byId('asleep-on-chest'), out('Hugo fell asleep on my chest.')).firstPerson).toBe(false);
    expect(deterministicChecks(byId('dog-lick'), out('We watched the dog lick Luna.')).firstPerson).toBe(true);
  });

  it('has no expectation for ordinary cases', () => {
    expect(deterministicChecks(byId('one-word-park'), { title: 'Park day', caption: 'Ruby at the park.' }).emptyCaptionOk).toBeNull();
  });
});

describe('judge', () => {
  it('sends a schema the API accepts (no unsupported keywords, enum kept)', () => {
    const json = JSON.stringify(judgeSchema());
    for (const k of UNSUPPORTED_SCHEMA_KEYWORDS) expect(json).not.toContain(`"${k}"`);
    expect(json).toContain('"enum"');
  });

  it('gives the judge the note, implied facts and the output', () => {
    const [m] = buildJudgeMessages(byId('farmers-market'), { title: 'Market day', caption: 'Sam ate half a peach.' });
    expect(m?.content).toContain('we went to the farmers market');
    expect(m?.content).toContain('the parents were there');
    expect(m?.content).toContain('Sam ate half a peach.');
  });

  it('parses a valid verdict and rejects malformed ones', () => {
    const reply = (text: string, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text }] });
    expect(parseJudge(reply('{"claims":[{"text":"with her family","kind":"person"}]}'))).toEqual({
      ok: true,
      claims: [{ text: 'with her family', kind: 'person' }],
    });
    expect(parseJudge(reply('{"claims":[{"text":"x","kind":"vibe"}]}')).ok).toBe(false);
    expect(parseJudge(reply('nope')).ok).toBe(false);
    expect(parseJudge(reply('{"claims":[]}', 'max_tokens')).ok).toBe(false);
  });

  it('counts everything but feelings as added content (product decision)', () => {
    expect(isAddedContent({ text: 'so proud', kind: 'feeling' })).toBe(false);
    expect(isAddedContent({ text: 'while Zoe napped', kind: 'event' })).toBe(true);
  });
});

describe('summarize', () => {
  const row = (over: Partial<EvalRow>): EvalRow => ({
    caseId: 'x',
    status: 'ok',
    latencyMs: 1000,
    output: { title: 't', caption: 'c' },
    warnings: [],
    checks: { emptyCaptionOk: null, mentionsPhotos: false, firstPerson: false, copiedExample: false, missing: [] },
    claims: [],
    ...over,
  });

  it('computes the added-content rate and detector agreement against the judge', () => {
    const s = summarize([
      row({ claims: [{ text: 'with her family', kind: 'person' }], warnings: [{ code: 'possible_fabrication', terms: ['family'] }] }), // caught
      row({ claims: [{ text: 'while Zoe napped', kind: 'event' }] }), // missed
      row({ claims: [{ text: 'so proud', kind: 'feeling' }] }), // feelings only: not added
      row({ warnings: [{ code: 'possible_fabrication', terms: ['first'] }] }), // extra
      row({ warnings: [{ code: 'first_person', terms: ['me'] }] }), // voice check: not compared with the judge
      row({ claims: null, judgeError: 'timeout' }),
      row({ status: 'fallback', reason: 'timeout', claims: null, latencyMs: 12000 }),
    ]);
    expect(s.okRate).toBe('86% (6/7)');
    expect(s.addedContentRate).toBe('40% (2/5)');
    expect(s.detector).toEqual({ caught: 1, missed: 1, extra: 1 });
    expect(s.claimsByKind).toEqual({ person: 1, event: 1, feeling: 1 });
    expect(s.judgeErrors).toBe(1);
    expect(s.latencyMs.max).toBe(12000);
  });
});
