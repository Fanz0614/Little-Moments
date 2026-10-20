import { z } from 'zod';
import { isValidCalendarDate } from './derive';

export const GENDERS = ['girl', 'boy', 'unspecified'] as const;
export type Gender = (typeof GENDERS)[number];

export const MIN_BIRTHDAY = '2000-01-01';
export const NICKNAME_MAX = 20;
export const NAME_MAX = 40;

/**
 * Validation for the profile form. `today` (local calendar date) is injected
 * so "birthday can't be in the future" is testable and time-zone correct.
 * Calendar strings compare correctly with < and > because they are zero-padded.
 */
export function babyInputSchema(today: string) {
  return z.object({
    nickname: z
      .string()
      .trim()
      .min(1, 'Please enter a nickname')
      .max(NICKNAME_MAX, `Nickname can be at most ${NICKNAME_MAX} characters`),
    name: z
      .string()
      .trim()
      .max(NAME_MAX, `Name can be at most ${NAME_MAX} characters`)
      .transform((s) => (s.length === 0 ? null : s))
      .nullable(),
    birthday: z
      .string()
      .refine(isValidCalendarDate, 'Please choose a valid date')
      .refine((d) => d <= today, "Birthday can't be in the future")
      .refine((d) => d >= MIN_BIRTHDAY, 'Please check the year'),
    gender: z.enum(GENDERS),
    /** Relative path under the document directory, or null. */
    avatarPath: z.string().min(1).nullable(),
  });
}

export type BabyInput = z.input<ReturnType<typeof babyInputSchema>>;
export type BabyFields = z.output<ReturnType<typeof babyInputSchema>>;

export type Baby = BabyFields & {
  id: string;
  createdAt: number;
  updatedAt: number;
};
