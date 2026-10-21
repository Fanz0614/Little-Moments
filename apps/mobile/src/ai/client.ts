import {
  CaptionRequest,
  CaptionResponse,
  type CaptionInput,
  type CaptionOutput,
  type Warning,
} from '@lm/ai-contracts';

/**
 * Talks to the local caption proxy (apps/api). Pure apart from `fetch`, which
 * is injectable so this is unit-tested in Node.
 *
 * Base URL: EXPO_PUBLIC_API_URL, default 127.0.0.1:8787 (works in the iOS
 * simulator). A physical device needs the Mac's LAN address, with the API
 * started as HOST=0.0.0.0. The Android emulator reaches the Mac at 10.0.2.2.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

/** A little over the server's 12 s budget, so the server's own fallback normally wins. */
export const CLIENT_TIMEOUT_MS = 13_000;

export type AssistResult =
  | { kind: 'ok'; requestId: string; output: CaptionOutput; warnings: Warning[]; latencyMs: number }
  /** Nothing usable: the user keeps their own words. `reason` is for metrics only. */
  | { kind: 'unavailable'; requestId: string; reason: string; latencyMs: number };

type Deps = { fetch?: typeof fetch; now?: () => number; timeoutMs?: number; baseUrl?: string };

export async function requestCaption(
  input: CaptionInput,
  ids: { requestId: string; deviceId: string },
  deps: Deps = {},
): Promise<AssistResult> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const t0 = now();
  const done = (r: { kind: 'unavailable'; reason: string }): AssistResult => ({ ...r, requestId: ids.requestId, latencyMs: now() - t0 });

  // Validate before sending: the same schema the server applies (unknown fields
  // such as a full name or birthday are stripped here, not just on the server).
  const body = CaptionRequest.safeParse({ requestId: ids.requestId, input });
  if (!body.success) return done({ kind: 'unavailable', reason: 'invalid_request' });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs ?? CLIENT_TIMEOUT_MS);
  try {
    const res = await doFetch(`${deps.baseUrl ?? API_URL}/v1/captions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': ids.deviceId },
      body: JSON.stringify(body.data),
      signal: abort.signal,
    });
    if (!res.ok) return done({ kind: 'unavailable', reason: `http_${res.status}` });
    const parsed = CaptionResponse.safeParse(await res.json());
    if (!parsed.success) return done({ kind: 'unavailable', reason: 'bad_response' });
    const r = parsed.data;
    // The server's fallback is "your own words": nothing to offer as a suggestion.
    if (r.status === 'fallback') return done({ kind: 'unavailable', reason: r.reason });
    // An empty caption (empty or instruction-only note) is not a suggestion either.
    if (r.result.caption.trim() === '') return done({ kind: 'unavailable', reason: 'empty_caption' });
    return { kind: 'ok', requestId: ids.requestId, output: r.result, warnings: r.warnings, latencyMs: now() - t0 };
  } catch {
    return done({ kind: 'unavailable', reason: abort.signal.aborted ? 'timeout' : 'network' });
  } finally {
    clearTimeout(timer);
  }
}

/** Short user-facing wording for a fabrication warning: the terms to double-check. */
export function warningTerms(warnings: readonly Warning[]): string[] {
  return warnings.flatMap((w) => (w.code === 'possible_fabrication' || w.code === 'first_person' ? w.terms : []));
}
