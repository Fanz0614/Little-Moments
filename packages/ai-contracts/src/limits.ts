/** All size limits in one place so prompt, schema, fallback and tests agree. */
export const LIMITS = {
  nickname: 20,
  ageText: 40,
  /** The user's sentence. Enforced on the request, so the prompt stays small. */
  note: 300,
  /** Hard limit; over this the model is asked to rewrite once. */
  title: 40,
  /** Soft limit: asked for in the prompt, layout is designed for it. */
  captionSoft: 200,
  /** Hard limit; 201–300 is accepted with a `long_caption` warning, never truncated. */
  captionHard: 300,
  /** Output is ~60–120 tokens of JSON; generous headroom so `max_tokens` signals a real problem. */
  maxOutputTokens: 400,
} as const;

/** Characters as a person counts them (code points), not UTF-16 units: an emoji is 1, not 2. */
export function charCount(s: string): number {
  return [...s].length;
}
