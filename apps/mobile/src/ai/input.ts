import type { CaptionInput } from '@lm/ai-contracts';
import { ageText } from '../baby/derive';
import type { Baby } from '../baby/profile';

/**
 * The only baby data that leaves the device: nickname, age text and pronoun,
 * plus the user's own sentence. Never the full name, birthday or photos.
 */
export function buildCaptionInput(baby: Pick<Baby, 'nickname' | 'birthday' | 'gender'>, journalDate: string, note: string, photoCount: number): CaptionInput {
  return {
    nickname: baby.nickname,
    ageText: ageText(baby.birthday, journalDate),
    note: note.trim(),
    photoCount,
    pronoun: baby.gender === 'girl' ? 'she' : baby.gender === 'boy' ? 'he' : 'they',
  };
}

/** Starters for the writing prompts under the note box. Tapping one appends its text. */
export const WRITING_PROMPTS: readonly { label: string; starter: string }[] = [
  { label: 'What happened?', starter: 'Today ' },
  { label: 'Who was there?', starter: 'With ' },
  { label: 'What made you smile?', starter: 'Made me smile: ' },
];

export function appendStarter(note: string, starter: string): string {
  const trimmed = note.trimEnd();
  if (trimmed === '') return starter;
  const sep = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${sep}${starter}`;
}
