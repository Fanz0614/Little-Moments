import { z } from 'zod';
import { ErrorCode } from './errors';
import { CaptionOutput } from './output';
import { Warning } from './warnings';

export const ResponseMeta = z.object({
  requestId: z.uuid(),
  promptVersion: z.string(),
  /** Absent when no model call was made (e.g. quota exceeded). */
  model: z.string().optional(),
  latencyMs: z.number().int().nonnegative(),
  /** Model calls made for this request, including the corrective retry. */
  attempts: z.number().int().nonnegative(),
});
export type ResponseMeta = z.infer<typeof ResponseMeta>;

/**
 * API -> App. Both branches carry a usable `result`, so the app renders the
 * same way either way; `status` only drives the "AI draft" vs "your words" label.
 */
export const CaptionResponse = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), result: CaptionOutput, warnings: z.array(Warning), meta: ResponseMeta }),
  z.object({ status: z.literal('fallback'), result: CaptionOutput, reason: ErrorCode, meta: ResponseMeta }),
]);
export type CaptionResponse = z.infer<typeof CaptionResponse>;
