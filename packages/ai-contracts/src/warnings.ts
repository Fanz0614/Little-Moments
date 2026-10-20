import { z } from 'zod';
import { LIMITS, charCount } from './limits';
import type { CaptionOutput } from './output';

/**
 * Non-fatal findings. They never block the result; `possible_fabrication` is
 * shown to the user (and saved with the text layer) until they edit or confirm.
 */
export const Warning = z.discriminatedUnion('code', [
  z.object({ code: z.literal('possible_fabrication'), terms: z.array(z.string()).min(1) }),
  z.object({ code: z.literal('long_caption'), length: z.number().int() }),
]);
export type Warning = z.infer<typeof Warning>;

/**
 * Milestone wording. If the output uses one of these and the user's note does
 * not, the model probably invented an event. Each pattern is matched against
 * both texts, so word forms on either side are compared like for like.
 */
const MILESTONES: readonly { term: string; re: RegExp }[] = [
  { term: 'first', re: /\bfirst\b/i },
  { term: 'milestone', re: /\bmilestones?\b/i },
  { term: 'rolled over', re: /\broll(?:s|ed|ing)?\s+over\b/i },
  { term: 'crawling', re: /\bcrawl(?:s|ed|ing)?\b/i },
  // Verb forms only: "went for a walk" (noun) is not a milestone.
  { term: 'walking', re: /\bwalk(?:ed|ing)\b/i },
  { term: 'standing', re: /\b(?:stood|stand(?:s|ing)?)\b/i },
  { term: 'sitting up', re: /\b(?:sat|sit(?:s|ting)?)\s+up\b/i },
  // Babies rarely "say" things; if the user didn't write it, the model made it up.
  { term: 'speaking', re: /\b(?:said|says|saying)\b/i },
  { term: 'tooth', re: /\b(?:tooth|teeth|teething)\b/i },
  { term: 'birthday', re: /\bbirthdays?\b/i },
];
// Deliberately not listed: "words", "steps" (too many idioms: "no words", "next steps").
// "first word" / "first steps" are caught by "first".

export function findFabricatedMilestones(output: CaptionOutput, note: string): string[] {
  const text = `${output.title}\n${output.caption}`;
  return MILESTONES.filter((m) => m.re.test(text) && !m.re.test(note)).map((m) => m.term);
}

export function semanticWarnings(output: CaptionOutput, note: string): Warning[] {
  const warnings: Warning[] = [];
  const terms = findFabricatedMilestones(output, note);
  if (terms.length > 0) warnings.push({ code: 'possible_fabrication', terms });
  const length = charCount(output.caption);
  if (length > LIMITS.captionSoft) warnings.push({ code: 'long_caption', length });
  return warnings;
}
