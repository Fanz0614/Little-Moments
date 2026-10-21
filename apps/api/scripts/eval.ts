/**
 * Caption quality eval against the real API (not run in tests). Uses the fixed
 * cases in eval/cases.ts so prompt versions can be compared like for like.
 *
 *   pnpm eval        # every case once: 30 caption calls + up to 30 judge calls
 *   pnpm eval 3      # every case 3 times (outputs vary between runs)
 *
 * JUDGE_MODEL overrides the judge (default: a larger model than the captioner,
 * so it isn't grading its own habits). Results are written to eval/results/
 * (gitignored); paste the summary to compare versions.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CaptionInput, PROMPT_VERSION } from '@lm/ai-contracts';
import { createAnthropicClient } from '../src/anthropic';
import { loadConfig } from '../src/config';
import { generateCaption, realClock } from '../src/generate';
import { EVAL_CASES } from '../eval/cases';
import { deterministicChecks, summarize, type EvalRow } from '../eval/checks';
import { JUDGE_SYSTEM, buildJudgeMessages, isAddedContent, judgeSchema, parseJudge } from '../eval/judge';

const reps = Number(process.argv[2] ?? 1);
const config = loadConfig(process.env);
const judgeModel = process.env.JUDGE_MODEL?.trim() || 'claude-sonnet-5-5';
const model = createAnthropicClient(config.anthropicApiKey);

console.log(`eval: prompt=${PROMPT_VERSION} model=${config.model} judge=${judgeModel} cases=${EVAL_CASES.length} reps=${reps}`);

const rows: EvalRow[] = [];
for (let rep = 0; rep < reps; rep++) {
  for (const c of EVAL_CASES) {
    const input = CaptionInput.parse(c.input);
    const t0 = Date.now();
    const report = await generateCaption(input, { model, clock: realClock, config });
    const row: EvalRow = {
      caseId: c.id,
      status: report.status,
      reason: report.status === 'fallback' ? report.reason : undefined,
      latencyMs: Date.now() - t0,
      output: report.result,
      warnings: report.status === 'ok' ? report.warnings : [],
      checks: deterministicChecks(c, report.result),
      claims: null,
    };

    if (report.status === 'ok') {
      try {
        const reply = await model.create(
          { model: judgeModel, system: JUDGE_SYSTEM, messages: buildJudgeMessages(c, report.result), maxTokens: 800, schema: judgeSchema() },
          { timeoutMs: 30_000 },
        );
        const judged = parseJudge(reply);
        if (judged.ok) row.claims = judged.claims;
        else row.judgeError = judged.detail;
      } catch (e) {
        row.judgeError = e instanceof Error ? e.message : String(e);
      }
    }
    rows.push(row);
    printRow(c.input.note, row);
  }
}

const summary = summarize(rows);
console.log('\nsummary:', JSON.stringify(summary, null, 2));

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'eval', 'results');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${PROMPT_VERSION.replace('@', '-')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ promptVersion: PROMPT_VERSION, model: config.model, judgeModel, reps, summary, rows }, null, 2));
console.log(`\nfull results: ${file}`);

/** Every output is printed, issues first in each block, so a person can overrule the judge. */
function printRow(note: string, r: EvalRow) {
  const issues: string[] = [];
  if (r.status === 'fallback') issues.push(`FALLBACK ${r.reason}`);
  const addedClaims = (r.claims ?? []).filter(isAddedContent);
  if (addedClaims.length) issues.push(`ADDED ${addedClaims.map((c) => `${c.kind}:"${c.text}"`).join(', ')}`);
  const feelings = (r.claims ?? []).filter((c) => !isAddedContent(c));
  if (feelings.length) issues.push(`feeling ${feelings.map((c) => `"${c.text}"`).join(', ')}`);
  if (r.warnings.length) issues.push(`warnings ${JSON.stringify(r.warnings)}`);
  if (r.checks.emptyCaptionOk === false) issues.push('EXPECTED EMPTY CAPTION');
  if (r.checks.mentionsPhotos) issues.push('MENTIONS PHOTOS');
  if (r.checks.firstPerson) issues.push('FIRST PERSON');
  if (r.checks.copiedExample) issues.push('COPIED EXAMPLE');
  if (r.judgeError) issues.push(`judge error: ${r.judgeError}`);

  console.log(`\n[${r.caseId}] ${r.status} ${r.latencyMs} ms${issues.length ? '' : '  ✓'}`);
  console.log(`  note:    ${note || '(empty)'}`);
  console.log(`  title:   ${r.output.title}`);
  console.log(`  caption: ${r.output.caption || '(empty)'}`);
  for (const i of issues) console.log(`  - ${i}`);
}
