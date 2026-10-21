import { z } from 'zod';
import { LIMITS, charCount } from './limits';
import type { CaptionOutput } from './output';

/**
 * Non-fatal findings. They never block the result; `possible_fabrication` and
 * `first_person` are shown to the user (and saved with the text layer) until
 * they edit or confirm.
 */
export const Warning = z.discriminatedUnion('code', [
  /** Milestones or people the note never mentioned. */
  z.object({ code: z.literal('possible_fabrication'), terms: z.array(z.string()).min(1) }),
  /** I / me / we ... that the note did not use: the caption speaks in the parent's voice. */
  z.object({ code: z.literal('first_person'), terms: z.array(z.string()).min(1) }),
  z.object({ code: z.literal('long_caption'), length: z.number().int() }),
]);
export type Warning = z.infer<typeof Warning>;

type Rule = { term: string; re: RegExp; allowIf?: RegExp };

/**
 * Each pattern is matched against both texts, so word forms on either side are
 * compared like for like: flagged when the output matches and the note doesn't.
 */
function unsupported(rules: readonly Rule[], output: CaptionOutput, note: string): string[] {
  const text = `${output.title}\n${output.caption}`;
  return rules.filter((r) => r.re.test(text) && !r.re.test(note) && !r.allowIf?.test(note)).map((r) => r.term);
}

/** Milestone wording: if the output uses one and the note does not, the model probably invented an event. */
const MILESTONES: readonly Rule[] = [
  { term: 'first', re: /\bfirst\b/i },
  { term: 'milestone', re: /\bmilestones?\b/i },
  { term: 'rolled over', re: /\broll(?:s|ed|ing)?\s+over\b/i },
  { term: 'crawling', re: /\bcrawl(?:s|ed|ing)?\b/i },
  // Verb forms only: "went for a walk" (noun) is not a milestone.
  { term: 'walking', re: /\bwalk(?:ed|ing)\b/i },
  { term: 'standing', re: /\b(?:stood|stand(?:s|ing)?)\b/i },
  { term: 'sitting up', re: /\b(?:sat|sit(?:s|ting)?)\s+up\b/i },
  // Reported speech only: a quote, or a typical first word. Plain "said" is too
  // idiomatic ("said it all", "needless to say") and caused false positives.
  {
    term: 'speaking',
    re: /\b(?:said|says|saying)\s+(?:["“'‘]|(?:mama|mummy|mommy|mum|mom|dada|daddy|papa|hi|hello|bye|no)\b)/i,
  },
  { term: 'tooth', re: /\b(?:tooth|teeth|teething)\b/i },
  { term: 'birthday', re: /\bbirthdays?\b/i },
];
// Deliberately not listed: "words", "steps" (too many idioms: "no words", "next steps").
// "first word" / "first steps" are caught by "first".

/**
 * People who weren't in the note ("with her family", "her mom finished her
 * book"). "mama" / "dada" / "papa" are left to the speaking rule
 * (usually a baby's word, not a person in the scene). Mum and dad are separate: the model must not guess which parent
 * wrote the note. "We / us / our" in the note does imply the parents were there.
 */
const PEOPLE: readonly Rule[] = [
  { term: 'family', re: /\bfamil(?:y|ies)\b/i },
  { term: 'parents', re: /\bparents?\b/i, allowIf: /\b(?:we|us|our)\b/i },
  { term: 'mum', re: /\b(?:mum|mummy|mumma|mom|mommy|mother)s?\b/i },
  { term: 'dad', re: /\b(?:dad|daddy|father)s?\b/i },
  { term: 'grandparent', re: /\b(?:grand(?:ma|mother|mum|mom|pa|father|dad|parent)s?|nana|nanna|granny|gran|nonna|nonno|oma|opa)\b/i },
  { term: 'sibling', re: /\b(?:brother|sister|sibling|twin)s?\b/i },
  { term: 'friend', re: /\bfriends?\b/i },
  { term: 'aunt or uncle', re: /\b(?:aunt|aunty|auntie|uncle)s?\b/i },
  { term: 'cousin', re: /\bcousins?\b/i },
];

/** Captions are written about the baby in the third person (prompt rule). */
const FIRST_PERSON: readonly Rule[] = ['I', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves'].map(
  (w) => ({ term: w, re: new RegExp(`\\b${w}\\b`, 'i') }),
);

export function findFabricatedMilestones(output: CaptionOutput, note: string): string[] {
  return unsupported(MILESTONES, output, note);
}

export function findFabricatedPeople(output: CaptionOutput, note: string): string[] {
  return unsupported(PEOPLE, output, note);
}

/**
 * First-person words in the output when the note has none. A note written in
 * the first person ("on my chest") allows the caption to be too ("I loved it"):
 * it is the parent's own journal. Word-by-word comparison was too strict.
 */
export function findFirstPerson(output: CaptionOutput, note: string): string[] {
  if (FIRST_PERSON.some((r) => r.re.test(note))) return [];
  return unsupported(FIRST_PERSON, output, note);
}

export function semanticWarnings(output: CaptionOutput, note: string): Warning[] {
  const warnings: Warning[] = [];
  const terms = [...findFabricatedMilestones(output, note), ...findFabricatedPeople(output, note)];
  if (terms.length > 0) warnings.push({ code: 'possible_fabrication', terms });
  const voice = findFirstPerson(output, note);
  if (voice.length > 0) warnings.push({ code: 'first_person', terms: voice });
  const length = charCount(output.caption);
  if (length > LIMITS.captionSoft) warnings.push({ code: 'long_caption', length });
  return warnings;
}
