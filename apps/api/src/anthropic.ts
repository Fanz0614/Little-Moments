import Anthropic from '@anthropic-ai/sdk';
import { classifyHttpStatus } from '@lm/ai-contracts';
import { ProviderError, parseRetryAfter, type ModelCall, type ModelClient, type ModelReply } from './model';

/**
 * Anthropic SDK adapter. maxRetries is 0 on purpose: the SDK retries 2 times
 * by default, which would multiply with our own retries (up to 9 calls per
 * request) and blow the time budget.
 */
export function createAnthropicClient(apiKey: string): ModelClient {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return {
    async create(call: ModelCall, { timeoutMs }): Promise<ModelReply> {
      try {
        const msg = await client.messages.create(
          {
            model: call.model,
            max_tokens: call.maxTokens,
            system: call.system,
            messages: call.messages,
            output_config: { format: { type: 'json_schema', schema: call.schema } },
          },
          { timeout: timeoutMs, maxRetries: 0 },
        );
        return {
          stop_reason: msg.stop_reason,
          content: msg.content.map((b) => (b.type === 'text' ? { type: 'text', text: b.text } : { type: b.type })),
          model: msg.model,
          usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens },
        };
      } catch (e) {
        throw toProviderError(e);
      }
    },
  };
}

export function toProviderError(e: unknown, now = Date.now()): ProviderError {
  if (e instanceof ProviderError) return e;
  // Order matters: the timeout error is a subclass of the connection error.
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('timeout', e.message);
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError('timeout', e.message);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('network', e.message);
  if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
    return new ProviderError(classifyHttpStatus(e.status), e.message, e.status, parseRetryAfter(e.headers, now));
  }
  return new ProviderError('network', e instanceof Error ? e.message : String(e));
}
