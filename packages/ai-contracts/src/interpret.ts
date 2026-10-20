import { CaptionOutput } from './output';
import type { ErrorCode } from './errors';
import { LIMITS, charCount as len } from './limits';
import { semanticWarnings, type Warning } from './warnings';

/**
 * The parts of a Messages API response we depend on. Declared here instead of
 * importing the SDK so this package stays dependency-free and fixtures are plain objects.
 */
export type ProviderMessage = {
  stop_reason: string | null;
  content: ReadonlyArray<{ type: string; text?: string }>;
};

export type InterpretResult =
  | { ok: true; output: CaptionOutput; warnings: Warning[] }
  | {
      ok: false;
      code: ErrorCode;
      /** For logs: what exactly failed. Never shown to users. */
      detail: string;
      /**
       * Present when a rewrite could fix it (e.g. too long). The API appends
       * this to the conversation for its single corrective retry.
       */
      retryHint?: string;
    };

const WRAPPING_QUOTES = /^["'“”‘’«»]+|["'“”‘’«»]+$/g;

/** Cosmetic clean-up only. Never changes meaning and never shortens content. */
export function normalizeOutput(raw: { title?: unknown; caption?: unknown }): { title?: unknown; caption?: unknown } {
  const out: { title?: unknown; caption?: unknown } = { ...raw };
  if (typeof raw.title === 'string') {
    out.title = raw.title
      .replace(/\s+/g, ' ')
      .trim()
      .replace(WRAPPING_QUOTES, '')
      .replace(/\.$/, '')
      .trim();
  }
  if (typeof raw.caption === 'string') {
    out.caption = raw.caption.replace(/\s+/g, ' ').trim();
  }
  return out;
}

/**
 * Turn one raw model response into a validated caption or an error code.
 * Pure: no I/O, no retries. Order matters: stop_reason is checked before
 * parsing because refusals and truncations may not match the schema.
 */
export function interpret(msg: ProviderMessage, note: string): InterpretResult {
  if (msg.stop_reason === 'refusal') return { ok: false, code: 'refusal', detail: 'model refused' };
  if (msg.stop_reason === 'max_tokens') {
    return { ok: false, code: 'truncated', detail: `hit max_tokens (${LIMITS.maxOutputTokens}); raise the budget` };
  }
  if (msg.stop_reason !== 'end_turn' && msg.stop_reason !== 'stop_sequence') {
    return { ok: false, code: 'unexpected_stop', detail: `stop_reason=${String(msg.stop_reason)}` };
  }

  const text = msg.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text.trim()) return { ok: false, code: 'unexpected_stop', detail: 'no text content' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, code: 'invalid_json', detail: `JSON.parse: ${(e as Error).message}`, retryHint: 'Reply with valid JSON only.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, code: 'schema_violation', detail: 'top-level value is not an object' };
  }

  const normalized = normalizeOutput(parsed as Record<string, unknown>);
  const result = CaptionOutput.safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, code: 'schema_violation', detail: issues, retryHint: lengthHint(normalized) };
  }

  return { ok: true, output: result.data, warnings: semanticWarnings(result.data, note) };
}

/** A concrete rewrite instruction when the failure is length; otherwise a generic one. */
function lengthHint(n: { title?: unknown; caption?: unknown }): string {
  const parts: string[] = [];
  if (typeof n.title === 'string' && len(n.title) > LIMITS.title) {
    parts.push(`The title was ${len(n.title)} characters; rewrite it in at most ${LIMITS.title}.`);
  }
  if (typeof n.caption === 'string' && len(n.caption) > LIMITS.captionHard) {
    parts.push(`The caption was ${len(n.caption)} characters; rewrite it in at most ${LIMITS.captionSoft}.`);
  }
  if (typeof n.title === 'string' && n.title.length === 0) parts.push('The title must not be empty.');
  return parts.length > 0 ? parts.join(' ') : 'Return exactly the fields "title" and "caption" as described.';
}
