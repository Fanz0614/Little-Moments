import { PROMPT_EXAMPLES, findFirstPerson, type CaptionOutput, type Warning } from '@lm/ai-contracts';
import { EVAL_CASES, type EvalCase } from './cases';
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
  /** First-person words the note itself didn't use (caption@4 allows the note's own voice). */
  firstPerson: boolean;
  copiedExample: boolean;
  /** Entries of `mustKeep` the output dropped (empty when nothing is missing or the case has none). */
  missing: string[];
};

const PHOTOS = /\b(?:photos?|pictures?|snaps?|shots?)\b/i;
const EXAMPLE_TEXT = new Set(PROMPT_EXAMPLES.flatMap((e) => [e.output.title, e.output.caption].filter(Boolean)));

export function deterministicChecks(c: EvalCase, out: CaptionOutput): DeterministicChecks {
  const text = `${out.title}\n${out.caption}`;
  return {
    emptyCaptionOk: c.expectEmptyCaption === undefined ? null : (out.caption === '') === c.expectEmptyCaption,
    mentionsPhotos: PHOTOS.test(text) && !PHOTOS.test(c.input.note),
    firstPerson: findFirstPerson(out, c.input.note).length > 0,
    copiedExample: EXAMPLE_TEXT.has(out.title) || EXAMPLE_TEXT.has(out.caption),
    missing: (c.mustKeep ?? []).filter((k) => !text.toLowerCase().includes(k.toLowerCase())),
  };
}

// first_person is a voice check, not added content, so it is not compared with the judge.
const flagged = (r: EvalRow) => r.warnings.some((w) => w.code === 'possible_fabrication');
const added = (r: EvalRow) => (r.claims ?? []).some(isAddedContent);

const keepCases = new Set(EVAL_CASES.filter((c) => c.mustKeep?.length).map((c) => c.id));

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
  const withMustKeep = ok.filter((r) => keepCases.has(r.caseId));
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const kinds: Record<string, number> = {};
  for (const r of judged) for (const c of r.claims ?? []) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;

  return {
    outputs: rows.length,
    okRate: pct(ok.length, rows.length),
    addedContentRate: pct(judged.filter(added).length, judged.length),
    claimsByKind: kinds,
    /** Outputs that kept every key detail (people, places, numbers) listed for their case. */
    keptKeyDetails: pct(withMustKeep.filter((r) => r.checks.missing.length === 0).length, withMustKeep.length),
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
