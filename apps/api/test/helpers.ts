import type { CaptionInput } from '@lm/ai-contracts';
import { DEFAULTS, type Config } from '../src/config';
import type { Clock } from '../src/generate';
import { ProviderError, type ModelCall, type ModelClient, type ModelReply } from '../src/model';

export const config: Config = { ...DEFAULTS, anthropicApiKey: 'test-key' };

export const input: CaptionInput = {
  nickname: 'Mia',
  ageText: '3 months 12 days',
  note: 'rolled over by herself today and looked so surprised',
  photoCount: 3,
  pronoun: 'she',
};

/** Virtual time: sleep() and model latency advance the clock instantly. */
export class FakeClock implements Clock {
  t = 1_760_000_000_000;
  sleeps: number[] = [];
  now = () => this.t;
  random = () => 0.5;
  sleep = async (ms: number) => {
    this.sleeps.push(ms);
    this.t += ms;
  };
}

export const ok = (title = 'Mia rolls over', caption = 'Mia rolled over all by herself today.'): ModelReply => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ title, caption }) }],
  model: 'claude-haiku-5-5',
  usage: { input_tokens: 500, output_tokens: 40 },
});

export const text = (t: string, stop_reason = 'end_turn'): ModelReply => ({ stop_reason, content: [{ type: 'text', text: t }] });

type Step = { latencyMs?: number } & ({ reply: ModelReply } | { error: ProviderError });

/** Plays a script of replies/errors in order and records every call. */
export class FakeModel implements ModelClient {
  calls: { call: ModelCall; timeoutMs: number }[] = [];
  constructor(
    private readonly clock: FakeClock,
    private readonly steps: Step[],
  ) {}

  async create(call: ModelCall, opts: { timeoutMs: number }): Promise<ModelReply> {
    this.calls.push({ call, timeoutMs: opts.timeoutMs });
    const step = this.steps[this.calls.length - 1];
    if (!step) throw new Error(`unexpected model call #${this.calls.length}`);
    this.clock.t += Math.min(step.latencyMs ?? 1_000, opts.timeoutMs);
    if ('error' in step) throw step.error;
    return step.reply;
  }
}

export const err = (code: ConstructorParameters<typeof ProviderError>[0], status?: number, retryAfterMs?: number) =>
  new ProviderError(code, code, status, retryAfterMs);
