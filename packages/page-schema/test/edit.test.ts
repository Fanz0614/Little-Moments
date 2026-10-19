import { describe, expect, it } from 'vitest';
import { bringToFront, removeLayer, transformFrame, transformLayer, updateLayer, type PageDocument, type TextLayer } from '../src';

const frame = { x: 100, y: 100, width: 200, height: 100, rotation: 0 };

describe('transformFrame', () => {
  it('moves without resizing', () => {
    expect(transformFrame(frame, { dx: 10, dy: -20, scale: 1, rotationDeg: 0 })).toEqual({ ...frame, x: 110, y: 80 });
  });

  it('scales around the centre', () => {
    const r = transformFrame(frame, { dx: 0, dy: 0, scale: 2, rotationDeg: 0 });
    expect(r).toEqual({ x: 0, y: 50, width: 400, height: 200, rotation: 0 });
  });

  it('clamps tiny scales to the minimum size, keeping aspect ratio', () => {
    const r = transformFrame(frame, { dx: 0, dy: 0, scale: 0.01, rotationDeg: 0 });
    expect(r.height).toBeCloseTo(24);
    expect(r.width / r.height).toBeCloseTo(2);
  });

  it('wraps rotation into [-180, 180)', () => {
    expect(transformFrame({ ...frame, rotation: 170 }, { dx: 0, dy: 0, scale: 1, rotationDeg: 30 }).rotation).toBe(-160);
    expect(transformFrame(frame, { dx: 0, dy: 0, scale: 1, rotationDeg: 360 }).rotation).toBe(0);
  });
});

describe('transformLayer', () => {
  it('scales text font size with the frame', () => {
    const t: TextLayer = {
      id: 't',
      type: 'text',
      text: 'hi',
      frame,
      style: { role: 'body', fontSize: 16, color: '#000000', align: 'left', bold: false, lineHeight: 1.4 },
      source: 'user',
    };
    expect(transformLayer(t, { dx: 0, dy: 0, scale: 1.5, rotationDeg: 0 }).style.fontSize).toBe(24);
  });
});

describe('document edits', () => {
  const doc = {
    layers: [
      { id: 'a', type: 'sticker', stickerId: 'heart', frame, color: '#000000' },
      { id: 'b', type: 'sticker', stickerId: 'star', frame, color: '#000000' },
    ],
    updatedAt: 0,
  } as unknown as PageDocument;

  it('bringToFront moves the layer to the end', () => {
    expect(bringToFront(doc, 'a', 5).layers.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('returns the same object when nothing changes', () => {
    expect(bringToFront(doc, 'b', 5)).toBe(doc);
    expect(removeLayer(doc, 'zzz', 5)).toBe(doc);
    expect(updateLayer(doc, 'zzz', (l) => l, 5)).toBe(doc);
  });

  it('stamps updatedAt on change', () => {
    expect(removeLayer(doc, 'a', 9).updatedAt).toBe(9);
  });
});
