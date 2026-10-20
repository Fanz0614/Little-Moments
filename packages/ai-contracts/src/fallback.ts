import { LIMITS, charCount } from './limits';
import type { CaptionOutput } from './output';
import type { CaptionInput } from './request';

/**
 * Deterministic caption used whenever AI generation fails, on the server or,
 * if the server can't be reached, on the device. It never invents anything:
 * the title is built from the profile, the caption is the user's own sentence.
 * Tests assert every valid input produces a valid CaptionOutput.
 */
export function fallbackCaption(input: Pick<CaptionInput, 'nickname' | 'ageText' | 'note'>): CaptionOutput {
  const nickname = oneLine(input.nickname);
  const candidates = [`${nickname} · ${oneLine(input.ageText)}`, `${nickname}'s little moment`, 'A little moment'];
  const title = candidates.find((t) => t.length > 0 && charCount(t) <= LIMITS.title) ?? 'A little moment';
  // The note is already capped at LIMITS.note (= captionHard) by the request schema; never truncated here.
  const caption = oneLine(input.note);
  return { title, caption };
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
