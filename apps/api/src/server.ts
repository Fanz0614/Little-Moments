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

// Localhost only by default: the simulator can reach it, other machines on the network can't
// spend your API quota. HOST=0.0.0.0 opts in to LAN access for testing on a physical device.
serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`[api] listening on http://${config.host}:${info.port}  model=${config.model}`);
});
