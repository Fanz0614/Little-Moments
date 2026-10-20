import { z } from 'zod';
import { LIMITS, charCount } from './limits';

/**
 * What the model must return. This Zod schema is the single source of truth:
 * the JSON Schema sent to the API is generated from it (see providerJsonSchema).
 *
 * Values are validated AFTER normalisation (interpret.ts), so they are already
 * trimmed and single-line here.
 */
export const CaptionOutput = z.strictObject({
  title: z
    .string()
    .min(1, 'title must not be empty')
    .refine((s) => charCount(s) <= LIMITS.title, `title must be at most ${LIMITS.title} characters`)
    .refine((s) => s.trim() === s && !/\s{2,}|\n/.test(s), 'title must be a single trimmed line'),
  /** May be empty: with no note from the user, a title alone is fine. */
  caption: z.string().refine((s) => charCount(s) <= LIMITS.captionHard, `caption must be at most ${LIMITS.captionHard} characters`),
});
export type CaptionOutput = z.infer<typeof CaptionOutput>;

/**
 * JSON Schema keywords the structured-outputs API rejects with a 400
 * (string length, numeric ranges, complex patterns). The generator strips them;
 * Zod still enforces the limits on the response.
 */
export const UNSUPPORTED_SCHEMA_KEYWORDS = [
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'pattern',
  'maxItems',
  '$schema',
] as const;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function strip(node: Json): Json {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(node)) {
      if ((UNSUPPORTED_SCHEMA_KEYWORDS as readonly string[]).includes(k)) continue;
      out[k] = strip(v);
    }
    // The API only accepts additionalProperties: false on objects.
    if (out.type === 'object') out.additionalProperties = false;
    return out;
  }
  return node;
}

/** The schema passed as `output_config.format.schema`. */
export function providerJsonSchema(): Json {
  return strip(z.toJSONSchema(CaptionOutput) as Json);
}
