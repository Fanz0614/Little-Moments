import { z } from 'zod';
import { LIMITS } from './limits';

/**
 * App -> API. Only what the caption needs: no full name, no birthday, no photos.
 * Unknown keys are stripped (not rejected) so a newer app can talk to an older server.
 */
export const CaptionInput = z.object({
  nickname: z.string().trim().min(1).max(LIMITS.nickname),
  /** Pre-formatted by the app, e.g. "3 months 12 days". */
  ageText: z.string().trim().min(1).max(LIMITS.ageText),
  note: z.string().trim().max(LIMITS.note),
  photoCount: z.number().int().min(1).max(10),
  /** From the profile's gender; omitted or 'they' when unspecified. */
  pronoun: z.enum(['she', 'he', 'they']).optional(),
});
export type CaptionInput = z.infer<typeof CaptionInput>;

export const CaptionRequest = z.object({
  /** Client-generated; reused across the app's own retries so logs line up. */
  requestId: z.uuid(),
  input: CaptionInput,
});
export type CaptionRequest = z.infer<typeof CaptionRequest>;
