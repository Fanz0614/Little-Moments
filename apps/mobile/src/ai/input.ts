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

/**
 * Writing prompts shown as chips under the note box. They only guide: tapping
 * one focuses the box and shows the question; it never writes into the note
 * (inserting "Today " for "What happened?" put words in the user's mouth).
 */
export const WRITING_PROMPTS: readonly string[] = ['What happened?', 'Who was there?', 'What made you smile?'];
