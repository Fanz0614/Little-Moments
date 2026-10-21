import { PROMPT_EXAMPLES, type CaptionOutput, type Warning } from '@lm/ai-contracts';
import type { EvalCase } from './cases';
import { isAddedContent, type Claim } from './judge';

/** One model output under evaluation. */
export type EvalRow = {
  caseId: string;
  status: 'ok' | 'fallback';
  reason?: string;
  latencyMs: number;
  output: CaptionOutput;
  warnings: Warning[];
  checks: DeterministicChecks;
  /** null when the judge was skipped (fallback) or failed. */
  claims: Claim[] | null;
  judgeError?: string;
};

export type DeterministicChecks = {
  /** null when the case has no expectation. */
  emptyCaptionOk: boolean | null;
  mentionsPhotos: boolean;
  /** Any first-person word at all (stricter than the warning, which allows words the note used). */
  firstPerson: boolean;
  copiedExample: boolean;
};

const PHOTOS = /\b(?:photos?|pictures?|snaps?|shots?)\b/i;
const FIRST_PERSON = /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
const EXAMPLE_TEXT = new Set(PROMPT_EXAMPLES.flatMap((e) => [e.output.title, e.output.caption].filter(Boolean)));

export function deterministicChecks(c: EvalCase, out: CaptionOutput): DeterministicChecks {
  const text = `${out.title}\n${out.caption}`;
  return {
    emptyCaptionOk: c.expectEmptyCaption === undefined ? null : (out.caption === '') === c.expectEmptyCaption,
    mentionsPhotos: PHOTOS.test(text) && !PHOTOS.test(c.input.note),
    firstPerson: FIRST_PERSON.test(text),
    copiedExample: EXAMPLE_TEXT.has(out.title) || EXAMPLE_TEXT.has(out.caption),
  };
}

const flagged = (r: EvalRow) => r.warnings.some((w) => w.code === 'possible_fabrication' || w.code === 'first_person');
const added = (r: EvalRow) => (r.claims ?? []).some(isAddedContent);

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(0)}% (${n}/${d})`);

function percentile(sorted: number[], p: number): number | undefined {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export type EvalSummary = ReturnType<typeof summarize>;

/**
 * The numbers to compare between prompt versions. The headline is
 * addedContentRate (judge): outputs with at least one unsupported non-feeling claim.
 * detector.* compares our regex warnings with the judge, to see what the
 * shipped checks miss (missed) and how noisy they are (extra).
 */
export function summarize(rows: readonly EvalRow[]) {
  const ok = rows.filter((r) => r.status === 'ok');
  const judged = ok.filter((r) => r.claims !== null);
  const withExpectation = ok.filter((r) => r.checks.emptyCaptionOk !== null);
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const kinds: Record<string, number> = {};
  for (const r of judged) for (const c of r.claims ?? []) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;

  return {
    outputs: rows.length,
    okRate: pct(ok.length, rows.length),
    addedContentRate: pct(judged.filter(added).length, judged.length),
    claimsByKind: kinds,
    emptyCaptionExpectation: pct(withExpectation.filter((r) => r.checks.emptyCaptionOk).length, withExpectation.length),
    mentionsPhotos: ok.filter((r) => r.checks.mentionsPhotos).length,
    firstPerson: ok.filter((r) => r.checks.firstPerson).length,
    copiedExample: ok.filter((r) => r.checks.copiedExample).length,
    detector: {
      caught: judged.filter((r) => added(r) && flagged(r)).length,
      missed: judged.filter((r) => added(r) && !flagged(r)).length,
      extra: judged.filter((r) => !added(r) && flagged(r)).length,
    },
    judgeErrors: ok.length - judged.length,
    latencyMs: { p50: percentile(latencies, 50), p90: percentile(latencies, 90), max: latencies.at(-1) },
  };
}
