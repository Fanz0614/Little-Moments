import {
  A4_PORTRAIT,
  CURRENT_SCHEMA_VERSION,
  PageDocumentSchema,
  coverCrop,
  insetFrame,
  type Layer,
  type PageDocument,
  type TextSource,
  type TextStyle,
} from '@lm/page-schema';
import { templatesFor, type PhotoSlot, type Template, type TextSlot } from './templates';

export type LayoutPhoto = {
  /** Local photo-store id. */
  id: string;
  width: number;
  height: number;
};

/**
 * Text measurement is injected because only the renderer (Skia Paragraph on
 * device) knows real glyph metrics. Tests pass a deterministic fake.
 * Must return the laid-out height for `text` wrapped at `maxWidth`.
 */
export type MeasureText = (text: string, style: TextStyle, maxWidth: number) => number;

export type LayoutInput = {
  pageId: string;
  journalDate: string; // YYYY-MM-DD
  photos: LayoutPhoto[];
  caption: string;
  /** Provenance of the caption text: 'ai-draft' when the user chose an AI caption. */
  captionSource?: 'user' | 'ai-draft';
  /** Pick the n-th best template for this photo set (used by "Shuffle layout"). Wraps around. */
  variant?: number;
  /** Force a template; falls back to ranking if it doesn't fit the photo count. */
  templateId?: string;
  locale?: 'zh' | 'en';
  /**
   * Pre-formatted age on journalDate (e.g. "3 months 12 days"). Computed by the
   * caller from the baby profile; the engine knows nothing about babies.
   * When present it replaces the weekday in the date line.
   */
  ageText?: string;
  now: number;
  createdAt?: number;
  newId: () => string;
};

export type LayoutWarning =
  | { kind: 'caption-overflow'; neededHeight: number; availableHeight: number }
  | { kind: 'empty-caption' };

export type LayoutResult = {
  doc: PageDocument;
  template: Template;
  /** Templates that fit this photo count, best first. */
  ranked: { templateId: string; cost: number }[];
  warnings: LayoutWarning[];
};

export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutError';
  }
}

export function layoutPage(input: LayoutInput, measure: MeasureText): LayoutResult {
  const { photos } = input;
  const candidates = templatesFor(photos.length);
  if (candidates.length === 0) {
    throw new LayoutError(`no template for ${photos.length} photos`);
  }
  for (const p of photos) {
    if (!(p.width > 0 && p.height > 0)) throw new LayoutError(`photo ${p.id} has no size`);
  }

  const ranked = candidates
    .map((t) => ({ template: t, ...bestAssignment(t.photos, photos) }))
    .sort((a, b) => a.cost - b.cost || a.template.id.localeCompare(b.template.id));

  let chosen = ranked[0]!;
  const forced = input.templateId ? ranked.find((r) => r.template.id === input.templateId) : undefined;
  if (forced) {
    chosen = forced;
  } else if (input.variant) {
    const n = ranked.length;
    chosen = ranked[((input.variant % n) + n) % n]!;
  }

  const t = chosen.template;
  const layers: Layer[] = [];

  t.photos.forEach((slot, i) => {
    const photo = photos[chosen.order[i]!]!;
    const inner = insetFrame(slot, slot.borderWidth);
    layers.push({
      id: input.newId(),
      type: 'photo',
      photoId: photo.id,
      frame: { x: slot.x, y: slot.y, width: slot.width, height: slot.height, rotation: slot.rotation },
      crop: coverCrop(photo.width, photo.height, inner.width, inner.height),
      borderWidth: slot.borderWidth,
      borderColor: '#FFFFFF',
      shadow: slot.shadow,
      cornerRadius: slot.cornerRadius,
    });
  });

  for (const d of t.decor) {
    layers.push({ id: input.newId(), type: 'sticker', stickerId: d.stickerId, frame: { ...d.frame }, color: d.color });
  }

  const warnings: LayoutWarning[] = [];
  layers.push(textLayer(input.newId(), dateLine(input.journalDate, input.locale ?? 'en', input.ageText), t.date, measure, 'template').layer);

  const caption = input.caption.trim();
  if (caption.length === 0) {
    warnings.push({ kind: 'empty-caption' });
  } else {
    const fitted = textLayer(input.newId(), caption, t.caption, measure, input.captionSource ?? 'user');
    layers.push(fitted.layer);
    if (fitted.overflow) warnings.push(fitted.overflow);
  }

  const doc: PageDocument = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: input.pageId,
    journalDate: input.journalDate,
    templateId: t.id,
    size: { ...A4_PORTRAIT },
    background: { color: t.background },
    layers,
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
  };

  return {
    // Validate our own output: a template bug should fail loudly here, not as a corrupt saved page.
    doc: PageDocumentSchema.parse(doc),
    template: t,
    ranked: ranked.map((r) => ({ templateId: r.template.id, cost: r.cost })),
    warnings,
  };
}

/**
 * Assign photos to slots minimising total aspect-ratio mismatch (in log space,
 * so 2:1 vs 1:1 costs the same as 1:2 vs 1:1). Photo counts are <= 5, so
 * brute force over permutations (max 120) is fine and fully deterministic.
 */
export function bestAssignment(slots: PhotoSlot[], photos: LayoutPhoto[]): { order: number[]; cost: number } {
  if (slots.length !== photos.length) throw new LayoutError('slot / photo count mismatch');
  const slotAspect = slots.map((s) => {
    const inner = insetFrame(s, s.borderWidth);
    return Math.log(inner.width / inner.height);
  });
  const photoAspect = photos.map((p) => Math.log(p.width / p.height));

  let best: number[] = [];
  let bestCost = Infinity;
  for (const perm of permutations(photos.length)) {
    let cost = 0;
    for (let i = 0; i < perm.length; i++) cost += Math.abs(slotAspect[i]! - photoAspect[perm[i]!]!);
    // Strict < keeps the earliest permutation on ties, which preserves the user's selection order.
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = perm;
    }
  }
  return { order: best, cost: round(bestCost) };
}

function* permutations(n: number): Generator<number[]> {
  const a = Array.from({ length: n }, (_, i) => i);
  yield a.slice();
  // Heap's algorithm would reorder the first result; use lexicographic next-permutation instead.
  while (true) {
    let i = n - 2;
    while (i >= 0 && a[i]! >= a[i + 1]!) i--;
    if (i < 0) return;
    let j = n - 1;
    while (a[j]! <= a[i]!) j--;
    [a[i], a[j]] = [a[j]!, a[i]!];
    a.splice(i + 1, n - i - 1, ...a.slice(i + 1).reverse());
    yield a.slice();
  }
}

/** Shrink font size until the text fits the slot height, never below minFontSize. */
export function fitText(
  text: string,
  slot: TextSlot,
  measure: MeasureText,
): { style: TextStyle; height: number; overflow: boolean } {
  let size = slot.style.fontSize;
  let height = measure(text, slot.style, slot.frame.width);
  while (height > slot.frame.height && size > slot.minFontSize) {
    size = Math.max(slot.minFontSize, round(size - 0.5));
    height = measure(text, { ...slot.style, fontSize: size }, slot.frame.width);
  }
  return { style: { ...slot.style, fontSize: size }, height, overflow: height > slot.frame.height };
}

function textLayer(id: string, text: string, slot: TextSlot, measure: MeasureText, source: TextSource) {
  const fitted = fitText(text, slot, measure);
  const layer: Layer = {
    id,
    type: 'text',
    text,
    // Height grows to the measured text if it still overflows at min size, so nothing is cut off.
    frame: { ...slot.frame, height: Math.max(slot.frame.height, Math.ceil(fitted.height)) },
    style: fitted.style,
    source,
  };
  const overflow: LayoutWarning | undefined = fitted.overflow
    ? { kind: 'caption-overflow', neededHeight: round(fitted.height), availableHeight: slot.frame.height }
    : undefined;
  return { layer, overflow };
}

const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** journalDate is a calendar date, so compute the weekday in UTC to avoid timezone drift. */
export function formatJournalDate(journalDate: string, locale: 'zh' | 'en'): string {
  const [y, m, d] = journalDate.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return locale === 'zh'
    ? `${y}年${m}月${d}日 · ${WEEKDAY_ZH[weekday]}`
    : `${WEEKDAY_EN[weekday]}, ${d} ${MONTH_EN[m - 1]} ${y}`;
}

/** The page's heading: date plus age when known, otherwise date plus weekday. */
export function dateLine(journalDate: string, locale: 'zh' | 'en', ageText?: string): string {
  const age = ageText?.trim();
  if (!age) return formatJournalDate(journalDate, locale);
  const [y, m, d] = journalDate.split('-').map(Number) as [number, number, number];
  return locale === 'zh' ? `${y}年${m}月${d}日 · ${age}` : `${d} ${MONTH_EN[m - 1]} ${y} · ${age}`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
