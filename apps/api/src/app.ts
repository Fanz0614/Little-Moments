import { Hono } from 'hono';
import { z } from 'zod';
import {
  CaptionRequest,
  CaptionResponse,
  PROMPT_VERSION,
  fallbackCaption,
  isAlertWorthy,
  type CaptionInput,
} from '@lm/ai-contracts';
import type { Config } from './config';
import { generateCaption, type AttemptRecord, type Clock } from './generate';
import type { ModelClient } from './model';
import { utcDay, type IdempotencyStore, type QuotaStore } from './stores';

export type LogLine = Record<string, unknown> & { level: 'info' | 'error' };

export type AppDeps = {
  config: Config;
  model: ModelClient;
  clock: Clock;
  quota: QuotaStore;
  idempotency: IdempotencyStore<CaptionResponse>;
  log: (line: LogLine) => void;
};

const DeviceId = z.uuid();

/** Short, non-reversible device key for quotas and logs; the raw id is never stored. */
export async function deviceKey(deviceId: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lm-device:${deviceId}`));
  return [...new Uint8Array(bytes)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createApp(deps: AppDeps) {
  const { config, clock, quota, idempotency, log } = deps;
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, model: config.model, promptVersion: PROMPT_VERSION }));

  app.post('/v1/captions', async (c) => {
    const started = clock.now();

    const deviceHeader = DeviceId.safeParse(c.req.header('x-device-id'));
    if (!deviceHeader.success) return c.json({ error: 'invalid_device_id' }, 400);

    const body = CaptionRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) {
      return c.json({ error: 'invalid_request', issues: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
    }

    const { requestId, input } = body.data;
    const device = await deviceKey(deviceHeader.data);

    let attempts: AttemptRecord[] = [];
    let tokens = { input_tokens: 0, output_tokens: 0 };

    const { value: response, replayed } = await idempotency.once(`${device}:${requestId}`, async () => {
      // Quota is consumed inside the idempotent block, so a replay never counts twice.
      const decision = await quota.consume(device, utcDay(clock.now()));
      if (!decision.allowed) {
        return CaptionResponse.parse({
          status: 'fallback',
          result: fallbackCaption(input),
          reason: 'quota_exceeded',
          meta: { requestId, promptVersion: PROMPT_VERSION, latencyMs: clock.now() - started, attempts: 0 },
        });
      }

      const report = await generateCaption(input, deps);
      attempts = report.attempts;
      tokens = report.usage;
      const meta = {
        requestId,
        promptVersion: PROMPT_VERSION,
        model: report.model,
        latencyMs: clock.now() - started,
        attempts: report.attempts.length,
      };
      // Validate our own output: a server bug should surface here, not as a broken app screen.
      return CaptionResponse.parse(
        report.status === 'ok'
          ? { status: 'ok', result: report.result, warnings: report.warnings, meta }
          : { status: 'fallback', result: report.result, reason: report.reason, meta },
      );
    });

    log(buildLogLine({ device, input, response, attempts, tokens, replayed, latencyMs: clock.now() - started }));
    return c.json(response);
  });

  app.onError((err, c) => {
    log({ level: 'error', event: 'unhandled', message: err.message });
    return c.json({ error: 'internal' }, 500);
  });

  return app;
}

/** Privacy: lengths only, never the note, nickname, title or caption themselves. */
function buildLogLine(p: {
  device: string;
  input: CaptionInput;
  response: CaptionResponse;
  attempts: AttemptRecord[];
  tokens: { input_tokens: number; output_tokens: number };
  replayed: boolean;
  latencyMs: number;
}): LogLine {
  const { response } = p;
  const alert = p.attempts.some((a) => a.outcome !== 'ok' && isAlertWorthy(a.outcome)) || (response.status === 'fallback' && isAlertWorthy(response.reason));
  return {
    level: alert ? 'error' : 'info',
    event: 'caption',
    requestId: response.meta.requestId,
    device: p.device,
    status: response.status,
    reason: response.status === 'fallback' ? response.reason : undefined,
    warnings: response.status === 'ok' ? response.warnings.map((w) => w.code) : [],
    attempts: p.attempts.map(({ n, outcome, ms, detail }) => ({ n, outcome, ms, detail })),
    replayed: p.replayed,
    latencyMs: p.latencyMs,
    model: response.meta.model,
    promptVersion: response.meta.promptVersion,
    tokens: p.tokens,
    lengths: {
      note: p.input.note.length,
      nickname: p.input.nickname.length,
      title: response.result.title.length,
      caption: response.result.caption.length,
    },
  };
}
