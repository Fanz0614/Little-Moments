import { describe, expect, it } from 'vitest';
import { A4_PORTRAIT, PageDocumentSchema, type TextStyle } from '@lm/page-schema';
import {
  LayoutError,
  SUPPORTED_PHOTO_COUNTS,
  TEMPLATES,
  bestAssignment,
  fitText,
  dateLine,
  formatJournalDate,
  getSticker,
  layoutPage,
  templatesFor,
  type LayoutInput,
  type LayoutPhoto,
  type MeasureText,
} from '../src';

/** Deterministic stand-in for Skia: every glyph is a square of fontSize. */
const fakeMeasure: MeasureText = (text: string, style: TextStyle, maxWidth: number) => {
  const perLine = Math.max(1, Math.floor(maxWidth / style.fontSize));
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return lines * style.fontSize * style.lineHeight;
};

const landscape = (id: string): LayoutPhoto => ({ id, width: 4032, height: 3024 });
const portrait = (id: string): LayoutPhoto => ({ id, width: 3024, height: 4032 });
const square = (id: string): LayoutPhoto => ({ id, width: 3000, height: 3000 });

function input(photos: LayoutPhoto[], extra: Partial<LayoutInput> = {}): LayoutInput {
  let n = 0;
  return {
    pageId: 'page-1',
    journalDate: '2026-10-19',
    photos,
    caption: '今天第一次自己翻身，然后对着镜头笑了好久。',
    now: 1_000,
    newId: () => `id-${++n}`,
    ...extra,
  };
}

describe('templates (data sanity)', () => {
  it('has templates for 3, 4 and 5 photos', () => {
    expect(SUPPORTED_PHOTO_COUNTS).toEqual([3, 4, 5]);
    for (const c of SUPPORTED_PHOTO_COUNTS) expect(templatesFor(c).length).toBeGreaterThanOrEqual(2);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s keeps every box on the page', (_id, t) => {
    const boxes = [...t.photos, t.date.frame, t.caption.frame, ...t.decor.map((d) => d.frame)];
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(A4_PORTRAIT.width);
      expect(b.y + b.height).toBeLessThanOrEqual(A4_PORTRAIT.height);
    }
    expect(t.photos).toHaveLength(t.photoCount);
  });

  it('only references stickers that exist', () => {
    for (const t of TEMPLATES) for (const d of t.decor) expect(getSticker(d.stickerId), `${t.id}:${d.stickerId}`).toBeDefined();
  });

  it('template ids are unique', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });
});

describe('layoutPage', () => {
  it.each(TEMPLATES.map((t) => [t.id, t.photoCount] as const))('produces a schema-valid page for %s', (templateId, count) => {
    const photos = Array.from({ length: count }, (_, i) => (i % 2 ? portrait(`p${i}`) : landscape(`p${i}`)));
    const { doc } = layoutPage(input(photos, { templateId }), fakeMeasure);
    expect(() => PageDocumentSchema.parse(doc)).not.toThrow();
    expect(doc.templateId).toBe(templateId);
    expect(doc.layers.filter((l) => l.type === 'photo')).toHaveLength(count);
  });

  it('uses every photo exactly once', () => {
    const photos = [landscape('a'), portrait('b'), square('c'), landscape('d')];
    const { doc } = layoutPage(input(photos), fakeMeasure);
    const used = doc.layers.flatMap((l) => (l.type === 'photo' ? [l.photoId] : [])).sort();
    expect(used).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts the portrait photo in the portrait slot of the film template', () => {
    // t4-film: slot 0 is tall, slots 1-3 are wide
    const photos = [landscape('a'), landscape('b'), portrait('tall'), landscape('c')];
    const { doc } = layoutPage(input(photos, { templateId: 't4-film' }), fakeMeasure);
    const first = doc.layers[0]!;
    expect(first.type === 'photo' && first.photoId).toBe('tall');
  });

  it('crop matches the inner (bordered) slot aspect ratio', () => {
    const { doc } = layoutPage(input([landscape('a'), portrait('b'), square('c')], { templateId: 't3-scatter' }), fakeMeasure);
    for (const l of doc.layers) {
      if (l.type !== 'photo') continue;
      const innerAspect = (l.frame.width - 2 * l.borderWidth) / (l.frame.height - 2 * l.borderWidth);
      const src = l.photoId === 'a' ? 4032 / 3024 : l.photoId === 'b' ? 3024 / 4032 : 1;
      const cropAspect = (l.crop.width * src) / l.crop.height;
      expect(cropAspect).toBeCloseTo(innerAspect, 5);
    }
  });

  it('variant cycles through ranked templates and wraps', () => {
    const photos = [landscape('a'), portrait('b'), square('c')];
    const r0 = layoutPage(input(photos), fakeMeasure);
    const r1 = layoutPage(input(photos, { variant: 1 }), fakeMeasure);
    const r2 = layoutPage(input(photos, { variant: 2 }), fakeMeasure);
    expect(r0.doc.templateId).toBe(r0.ranked[0]!.templateId);
    expect(r1.doc.templateId).toBe(r0.ranked[1]!.templateId);
    expect(r2.doc.templateId).toBe(r0.doc.templateId);
  });

  it('is deterministic for the same input', () => {
    const photos = [landscape('a'), portrait('b'), square('c'), landscape('d'), portrait('e')];
    expect(layoutPage(input(photos), fakeMeasure).doc).toEqual(layoutPage(input(photos), fakeMeasure).doc);
  });

  it('marks the date as template text and the caption as user text', () => {
    const { doc } = layoutPage(input([landscape('a'), portrait('b'), square('c')]), fakeMeasure);
    const texts = doc.layers.filter((l) => l.type === 'text');
    expect(texts.map((t) => t.type === 'text' && t.source)).toEqual(['template', 'user']);
  });

  it('warns on an empty caption and adds no caption layer', () => {
    const { doc, warnings } = layoutPage(input([landscape('a'), portrait('b'), square('c')], { caption: '   ' }), fakeMeasure);
    expect(warnings).toContainEqual({ kind: 'empty-caption' });
    expect(doc.layers.filter((l) => l.type === 'text')).toHaveLength(1);
  });

  it('rejects photo counts with no template', () => {
    expect(() => layoutPage(input([landscape('a'), portrait('b')]), fakeMeasure)).toThrow(LayoutError);
  });

  it('rejects photos without dimensions', () => {
    expect(() => layoutPage(input([landscape('a'), { id: 'z', width: 0, height: 0 }, square('c')]), fakeMeasure)).toThrow(/no size/);
  });
});

describe('fitText', () => {
  const slot = {
    frame: { x: 0, y: 0, width: 160, height: 48, rotation: 0 },
    style: { role: 'hand' as const, fontSize: 16, color: '#000000', align: 'left' as const, bold: false, lineHeight: 1.5 },
    minFontSize: 11,
  };

  it('keeps the preferred size when the text fits', () => {
    expect(fitText('短句', slot, fakeMeasure).style.fontSize).toBe(16);
  });

  it('shrinks long text until it fits', () => {
    const r = fitText('这'.repeat(24), slot, fakeMeasure);
    expect(r.style.fontSize).toBeLessThan(16);
    expect(r.style.fontSize).toBeGreaterThanOrEqual(11);
    expect(r.overflow).toBe(false);
  });

  it('stops at minFontSize and reports overflow', () => {
    const r = fitText('这'.repeat(200), slot, fakeMeasure);
    expect(r.style.fontSize).toBe(11);
    expect(r.overflow).toBe(true);
  });

  it('caption layer grows instead of clipping when it overflows', () => {
    const { doc, warnings } = layoutPage(
      input([landscape('a'), portrait('b'), square('c'), landscape('d'), portrait('e')], {
        templateId: 't5-mosaic',
        caption: '很长的一段话'.repeat(60),
      }),
      fakeMeasure,
    );
    expect(warnings.some((w) => w.kind === 'caption-overflow')).toBe(true);
    const caption = doc.layers.at(-1)!;
    const slotHeight = templatesFor(5).find((t) => t.id === 't5-mosaic')!.caption.frame.height;
    expect(caption.frame.height).toBeGreaterThan(slotHeight);
  });
});

describe('bestAssignment', () => {
  it('prefers the user order on ties', () => {
    const slots = templatesFor(4).find((t) => t.id === 't4-grid')!.photos;
    const photos = [square('a'), square('b'), square('c'), square('d')];
    expect(bestAssignment(slots, photos).order).toEqual([0, 1, 2, 3]);
  });
});

describe('dateLine', () => {
  it('uses the age instead of the weekday when given', () => {
    expect(dateLine('2026-10-19', 'en', '3 months 12 days')).toBe('19 October 2026 · 3 months 12 days');
    expect(dateLine('2026-10-19', 'zh', '3个月12天')).toBe('2026年10月19日 · 3个月12天');
  });
  it('falls back to the weekday without an age', () => {
    expect(dateLine('2026-10-19', 'en')).toBe('Monday, 19 October 2026');
    expect(dateLine('2026-10-19', 'en', '  ')).toBe('Monday, 19 October 2026');
  });
  it('is the heading of a generated page, in English by default', () => {
    const { doc } = layoutPage(input([landscape('a'), portrait('b'), square('c')], { ageText: '3 months 12 days' }), fakeMeasure);
    const heading = doc.layers.find((l) => l.type === 'text' && l.source === 'template');
    expect(heading?.type === 'text' && heading.text).toBe('19 October 2026 · 3 months 12 days');
  });
});

describe('formatJournalDate', () => {
  it('formats in Chinese and English with the right weekday', () => {
    expect(formatJournalDate('2026-10-19', 'zh')).toBe('2026年10月19日 · 星期一');
    expect(formatJournalDate('2026-10-19', 'en')).toBe('Monday, 19 October 2026');
  });
});

describe('templates (heading vs decor)', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s keeps stickers clear of the heading', (_id, t) => {
    const h = t.date.frame;
    for (const d of t.decor) {
      const overlaps = d.frame.x < h.x + h.width && d.frame.x + d.frame.width > h.x && d.frame.y < h.y + h.height && d.frame.y + d.frame.height > h.y;
      expect(overlaps, `${t.id}:${d.stickerId}`).toBe(false);
    }
  });
});

describe('caption provenance', () => {
  it('marks the caption as ai-draft when the caller says so, and as user by default', async () => {
    const { layoutPage } = await import('../src');
    const base = {
      pageId: 'p',
      journalDate: '2026-10-21',
      photos: [
        { id: 'a', width: 4000, height: 3000 },
        { id: 'b', width: 3000, height: 4000 },
        { id: 'c', width: 4000, height: 3000 },
      ],
      caption: 'Noah pulled himself up on the couch.',
      now: 1,
      newId: (() => {
        let n = 0;
        return () => `id-${n++}`;
      })(),
    };
    const measure = (text: string, style: { fontSize: number }, maxWidth: number) =>
      Math.ceil((text.length * style.fontSize * 0.5) / maxWidth) * style.fontSize * 1.4;
    const source = (r: ReturnType<typeof layoutPage>) =>
      r.doc.layers.filter((l) => l.type === 'text').map((l) => (l.type === 'text' ? l.source : null));
    expect(source(layoutPage({ ...base, captionSource: 'ai-draft' }, measure))).toEqual(['template', 'ai-draft']);
    expect(source(layoutPage(base, measure))).toEqual(['template', 'user']);
  });
});
