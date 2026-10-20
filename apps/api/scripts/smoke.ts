/**
 * Manual check against the real API (not run in tests): does the provider
 * accept our generated JSON Schema, and how fast is it?
 *
 *   cp .env.example .env   # add ANTHROPIC_API_KEY
 *   pnpm smoke             # or: pnpm smoke 5  (5 sequential runs for latency)
 */
import { CaptionInput, PROMPT_VERSION, providerJsonSchema } from '@lm/ai-contracts';
import { createAnthropicClient } from '../src/anthropic';
import { loadConfig } from '../src/config';
import { generateCaption, realClock } from '../src/generate';

const runs = Number(process.argv[2] ?? 3);
const config = loadConfig(process.env);
const model = createAnthropicClient(config.anthropicApiKey);

const cases: CaptionInput[] = [
  { nickname: 'Mia', ageText: '3 months 12 days', note: 'rolled over by herself today and looked so surprised', photoCount: 3, pronoun: 'she' },
  { nickname: 'Leo', ageText: '5 months', note: 'grandma visited, he held her finger all afternoon', photoCount: 4, pronoun: 'he' },
  { nickname: 'Ava', ageText: '2 weeks', note: '', photoCount: 5 },
];

console.log(`model=${config.model} prompt=${PROMPT_VERSION}`);
console.log('schema sent:', JSON.stringify(providerJsonSchema()));

const latencies: number[] = [];
for (let i = 0; i < runs; i++) {
  const input = CaptionInput.parse(cases[i % cases.length]);
  const t0 = Date.now();
  const report = await generateCaption(input, { model, clock: realClock, config });
  const ms = Date.now() - t0;
  latencies.push(ms);
  console.log(`\n#${i + 1} ${report.status} in ${ms} ms, attempts=${JSON.stringify(report.attempts)} tokens=${JSON.stringify(report.usage)}`);
  console.log(report.result);
  if (report.status === 'ok' && report.warnings.length) console.log('warnings:', report.warnings);
  if (report.status === 'fallback') console.log('reason:', report.reason);
}

const sorted = [...latencies].sort((a, b) => a - b);
console.log(`\nlatency ms: min=${sorted[0]} median=${sorted[Math.floor(sorted.length / 2)]} max=${sorted.at(-1)}`);
