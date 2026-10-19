import { frameCenter } from './geometry';
import type { Frame, Layer, PageDocument } from './schema';

/** Gesture result, applied around the layer's centre: scale, then rotate, then move. */
export type LayerTransform = { dx: number; dy: number; scale: number; rotationDeg: number };

export const MIN_LAYER_SIZE = 24;
export const MIN_FONT_SIZE = 6;

export function transformFrame(f: Frame, t: LayerTransform): Frame {
  const c = frameCenter(f);
  // Clamp the scale so neither side drops below the minimum, keeping aspect ratio.
  const minScale = Math.max(MIN_LAYER_SIZE / f.width, MIN_LAYER_SIZE / f.height);
  const s = Math.max(t.scale, Math.min(1, minScale));
  const width = f.width * s;
  const height = f.height * s;
  return {
    x: c.x + t.dx - width / 2,
    y: c.y + t.dy - height / 2,
    width,
    height,
    rotation: normaliseDeg((f.rotation ?? 0) + t.rotationDeg),
  };
}

export function transformLayer<L extends Layer>(layer: L, t: LayerTransform): L {
  const frame = transformFrame(layer.frame, t);
  if (layer.type === 'text') {
    const s = frame.width / layer.frame.width;
    return { ...layer, frame, style: { ...layer.style, fontSize: Math.max(MIN_FONT_SIZE, round2(layer.style.fontSize * s)) } };
  }
  return { ...layer, frame };
}

export function updateLayer(doc: PageDocument, id: string, fn: (l: Layer) => Layer, now: number): PageDocument {
  let found = false;
  const layers = doc.layers.map((l) => {
    if (l.id !== id) return l;
    found = true;
    return fn(l);
  });
  return found ? { ...doc, layers, updatedAt: now } : doc;
}

export function removeLayer(doc: PageDocument, id: string, now: number): PageDocument {
  const layers = doc.layers.filter((l) => l.id !== id);
  return layers.length === doc.layers.length ? doc : { ...doc, layers, updatedAt: now };
}

export function bringToFront(doc: PageDocument, id: string, now: number): PageDocument {
  const i = doc.layers.findIndex((l) => l.id === id);
  if (i < 0 || i === doc.layers.length - 1) return doc;
  const layers = [...doc.layers];
  const [l] = layers.splice(i, 1);
  layers.push(l!);
  return { ...doc, layers, updatedAt: now };
}

export function addLayer(doc: PageDocument, layer: Layer, now: number): PageDocument {
  return { ...doc, layers: [...doc.layers, layer], updatedAt: now };
}

function normaliseDeg(d: number): number {
  const r = ((d % 360) + 540) % 360 - 180; // -> [-180, 180)
  return Math.abs(r) < 1e-9 ? 0 : round2(r);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
