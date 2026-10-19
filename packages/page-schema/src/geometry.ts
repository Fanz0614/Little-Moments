import type { Crop, Frame } from './schema';

export type Point = { x: number; y: number };

export function frameCenter(f: Frame): Point {
  return { x: f.x + f.width / 2, y: f.y + f.height / 2 };
}

/** True if a page-space point lies inside the (possibly rotated) frame. */
export function frameContains(f: Frame, p: Point, slop = 0): boolean {
  const c = frameCenter(f);
  const rad = (-(f.rotation ?? 0) * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= f.width / 2 + slop && Math.abs(ly) <= f.height / 2 + slop;
}

/**
 * Largest crop of an image (imgW x imgH) with the frame's aspect ratio,
 * centred on `focus` (normalised 0..1) and clamped to stay inside the image.
 * This is "object-fit: cover" with a movable focal point.
 */
export function coverCrop(imgW: number, imgH: number, frameW: number, frameH: number, focus: Point = { x: 0.5, y: 0.5 }): Crop {
  const imgAspect = imgW / imgH;
  const frameAspect = frameW / frameH;
  let width = 1;
  let height = 1;
  if (imgAspect > frameAspect) {
    width = frameAspect / imgAspect; // image is wider: trim left/right
  } else {
    height = imgAspect / frameAspect; // image is taller: trim top/bottom
  }
  const x = clamp(focus.x - width / 2, 0, 1 - width);
  const y = clamp(focus.y - height / 2, 0, 1 - height);
  return { x, y, width, height };
}

/**
 * Rect at which to draw the whole source image so that `crop` lands exactly on
 * `frame` (before rotation). The caller clips to the frame.
 */
export function imageDrawRect(frame: Frame, crop: Crop): { x: number; y: number; width: number; height: number } {
  const width = frame.width / crop.width;
  const height = frame.height / crop.height;
  return { x: frame.x - crop.x * width, y: frame.y - crop.y * height, width, height };
}

/** The box the photo pixels occupy once the border is applied. */
export function insetFrame(frame: Frame, inset: number): Frame {
  const i = Math.max(0, Math.min(inset, frame.width / 2 - 1, frame.height / 2 - 1));
  return { ...frame, x: frame.x + i, y: frame.y + i, width: frame.width - 2 * i, height: frame.height - 2 * i };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
