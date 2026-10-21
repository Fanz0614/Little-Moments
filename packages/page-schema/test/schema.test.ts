import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  PageDocumentSchema,
  PageMigrationError,
  coverCrop,
  frameContains,
  imageDrawRect,
  insetFrame,
  migratePage,
  parseStoredPage,
} from '../src';

const validDoc = () => ({
  schemaVersion: CURRENT_SCHEMA_VERSION as number,
  id: 'page-1',
  journalDate: '2026-10-19',
  templateId: 't3-hero',
  size: { width: 595, height: 842 },
  background: { color: '#FFFFFF' },
  layers: [
    {
      id: 'l1',
      type: 'photo',
      photoId: 'p1',
      frame: { x: 10, y: 10, width: 100, height: 100, rotation: 0 },
      crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
    },
    {
      id: 'l2',
      type: 'text',
      text: '第一次笑出声',
      frame: { x: 10, y: 120, width: 200, height: 40 },
      style: { role: 'hand', fontSize: 16, color: '#333333' },
    },
    { id: 'l3', type: 'sticker', stickerId: 'heart', frame: { x: 0, y: 0, width: 20, height: 20 }, color: '#E8968C' },
  ],
  createdAt: 1,
  updatedAt: 2,
});

describe('PageDocumentSchema', () => {
  it('parses a valid page and fills defaults', () => {
    const doc = PageDocumentSchema.parse(validDoc());
    const photo = doc.layers[0]!;
    expect(photo.type === 'photo' && photo.borderWidth).toBe(0);
    expect(photo.frame.rotation).toBe(0);
    const text = doc.layers[1]!;
    expect(text.type === 'text' && text.style.align).toBe('left');
    expect(text.type === 'text' && text.source).toBe('user');
  });

  it('rejects a crop that leaves the image', () => {
    const raw = validDoc();
    (raw.layers[0] as { crop: unknown }).crop = { x: 0.6, y: 0, width: 0.5, height: 1 };
    expect(() => PageDocumentSchema.parse(raw)).toThrow();
  });

  it('rejects unknown layer types', () => {
    const raw = validDoc();
    (raw.layers as unknown[]).push({ id: 'x', type: 'video', frame: { x: 0, y: 0, width: 1, height: 1 } });
    expect(() => PageDocumentSchema.parse(raw)).toThrow();
  });
});

describe('migratePage', () => {
  it('round-trips the current version', () => {
    const doc = parseStoredPage(JSON.stringify(validDoc()));
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('refuses pages from a newer app instead of guessing', () => {
    expect(() => migratePage({ ...validDoc(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(PageMigrationError);
  });

  it('migrates a v1 page (as stored by the first release) to the current version', () => {
    const v1 = { ...validDoc(), schemaVersion: 1 };
    const doc = migratePage(v1);
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(doc.layers).toHaveLength(3);
    const text = doc.layers[1]!;
    expect(text.type === 'text' && text.source).toBe('user');
  });

  it('accepts ai-draft text from v2 on', () => {
    const raw = validDoc();
    (raw.layers[1] as { source?: string }).source = 'ai-draft';
    const text = parseStoredPage(JSON.stringify(raw)).layers[1]!;
    expect(text.type === 'text' && text.source).toBe('ai-draft');
  });

  it('refuses pages without a version', () => {
    const { schemaVersion: _, ...noVersion } = validDoc();
    expect(() => migratePage(noVersion)).toThrow(/schemaVersion/);
  });
});

describe('geometry', () => {
  it('coverCrop trims the long side of a landscape photo for a square frame', () => {
    expect(coverCrop(4000, 3000, 100, 100)).toEqual({ x: 0.125, y: 0, width: 0.75, height: 1 });
  });

  it('coverCrop clamps the focal point inside the image', () => {
    const c = coverCrop(3000, 4000, 100, 100, { x: 0.5, y: 0.01 });
    expect(c.y).toBe(0);
    expect(c.height).toBeCloseTo(0.75);
  });

  it('imageDrawRect maps the crop exactly onto the frame', () => {
    const frame = { x: 100, y: 50, width: 200, height: 100, rotation: 0 };
    const crop = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
    const r = imageDrawRect(frame, crop);
    // crop's top-left corner lands on the frame's top-left corner
    expect(r.x + crop.x * r.width).toBeCloseTo(frame.x);
    expect(r.y + crop.y * r.height).toBeCloseTo(frame.y);
    // crop's size equals the frame size
    expect(crop.width * r.width).toBeCloseTo(frame.width);
    expect(crop.height * r.height).toBeCloseTo(frame.height);
  });

  it('frameContains respects rotation', () => {
    const frame = { x: 0, y: 0, width: 100, height: 10, rotation: 90 };
    // rotated 90° around (50,5): the box now spans x 45..55, y -45..55
    expect(frameContains(frame, { x: 50, y: -40 })).toBe(true);
    expect(frameContains(frame, { x: 5, y: 5 })).toBe(false);
  });

  it('insetFrame never inverts a tiny frame', () => {
    const r = insetFrame({ x: 0, y: 0, width: 1, height: 1, rotation: 0 }, 10);
    expect(r.width).toBeGreaterThan(0);
  });
});
