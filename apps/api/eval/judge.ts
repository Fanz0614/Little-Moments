import { z } from 'zod';
import { toProviderJsonSchema, type CaptionOutput, type PromptMessage, type ProviderMessage } from '@lm/ai-contracts';
import type { EvalCase } from './cases';

/**
 * LLM-as-judge for "did the caption add facts the note doesn't support?".
 * Our regex checks only know a word list; the judge reads meaning. It is a
 * second opinion, not ground truth: the eval report prints every claim so a
 * person can overrule it, and the judge's own failures are counted, not hidden.
 */
export const CLAIM_KINDS = ['person', 'place', 'event', 'milestone', 'feeling', 'other'] as const;

export const JudgeOutput = z.strictObject({
  claims: z.array(z.strictObject({ text: z.string(), kind: z.enum(CLAIM_KINDS) })),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;
export type Claim = JudgeOutput['claims'][number];

/** Product decision (2026-10-21): a light touch of feeling is allowed; everything else counts as added content. */
export const isAddedContent = (c: Claim) => c.kind !== 'feeling';

export const JUDGE_SYSTEM = `You check one title and caption written for a baby photo journal against the parent's note.

List every claim in the title or caption that is not supported by the note, the baby facts, or the implied facts. A claim is something stated as true about the world: who was there, where it happened, what happened or what someone did, a developmental milestone, or how someone felt.

Classify each claim:
- person: someone present or involved whom the note does not mention
- place: a location the note does not mention
- event: something happening, or someone doing something, that the note does not mention
- milestone: a first time or developmental step (rolling, crawling, standing, walking, words, teeth) the note does not mention
- feeling: an emotion, reaction or mood the note does not mention
- other: any other unsupported fact

Not claims: rewording or summarising the note, leaving details out, the baby's name or age, and generic warmth that states no fact.
Quote the unsupported words exactly in "text". If everything is supported, return an empty list.`;

export function buildJudgeMessages(c: EvalCase, output: CaptionOutput): PromptMessage[] {
  const implied = c.implied?.length ? c.implied.join('; ') : 'none';
  return [
    {
      role: 'user',
      content: [
        `Baby facts: name ${c.input.nickname}; age ${c.input.ageText}.`,
        `Parent's note: ${JSON.stringify(c.input.note)}`,
        `Implied facts: ${implied}`,
        `Title: ${JSON.stringify(output.title)}`,
        `Caption: ${JSON.stringify(output.caption)}`,
      ].join('\n'),
    },
  ];
}

export const judgeSchema = () => toProviderJsonSchema(JudgeOutput) as Record<string, unknown>;

export function parseJudge(msg: ProviderMessage): { ok: true; claims: Claim[] } | { ok: false; detail: string } {
  if (msg.stop_reason !== 'end_turn') return { ok: false, detail: `stop_reason=${String(msg.stop_reason)}` };
  const text = msg.content.map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join('');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, detail: `JSON.parse: ${(e as Error).message}` };
  }
  const r = JudgeOutput.safeParse(raw);
  return r.success ? { ok: true, claims: r.data.claims } : { ok: false, detail: r.error.issues.map((i) => i.message).join('; ') };
}
