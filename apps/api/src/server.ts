import { serve } from '@hono/node-server';
import type { CaptionResponse } from '@lm/ai-contracts';
import { createApp } from './app';
import { createAnthropicClient } from './anthropic';
import { ConfigError, loadConfig } from './config';
import { realClock } from './generate';
import { MemoryIdempotencyStore, MemoryQuotaStore } from './stores';

let config;
try {
  config = loadConfig(process.env);
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`[api] ${e.message}`);
    process.exit(1);
  }
  throw e;
}

const app = createApp({
  config,
  model: createAnthropicClient(config.anthropicApiKey),
  clock: realClock,
  quota: new MemoryQuotaStore(config.perDeviceDailyLimit, config.globalDailyLimit),
  idempotency: new MemoryIdempotencyStore<CaptionResponse>(config.idempotencyTtlMs),
  log: (line) => (line.level === 'error' ? console.error : console.log)(JSON.stringify({ ts: new Date().toISOString(), ...line })),
});

// 0.0.0.0 so a physical device on the same Wi-Fi can reach the Mac, not just the simulator.
serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}  model=${config.model}`);
});
