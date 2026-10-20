import type { Frame, TextStyle } from '@lm/page-schema';

/**
 * Templates are pure data in page units (A4 portrait, 595 x 842).
 * Photo slots are listed in the order they are drawn (bottom -> top).
 */
export type PhotoSlot = Frame & {
  borderWidth: number;
  shadow: boolean;
  cornerRadius: number;
};

export type TextSlot = {
  frame: Frame;
  style: TextStyle;
  /** The fitter will not shrink text below this size. */
  minFontSize: number;
};

export type DecorSlot = { stickerId: string; frame: Frame; color: string };

export type Template = {
  id: string;
  name: string;
  photoCount: number;
  background: string;
  photos: PhotoSlot[];
  date: TextSlot;
  caption: TextSlot;
  decor: DecorSlot[];
};

const INK = '#4A3F35';
const SOFT_INK = '#7A6A5C';

const f = (x: number, y: number, width: number, height: number, rotation = 0): Frame => ({ x, y, width, height, rotation });

const polaroid = (frame: Frame): PhotoSlot => ({ ...frame, borderWidth: 10, shadow: true, cornerRadius: 0 });
const clean = (frame: Frame): PhotoSlot => ({ ...frame, borderWidth: 0, shadow: false, cornerRadius: 6 });

/** `width` < 515 leaves room for a corner sticker beside the heading. */
const dateSlot = (color = INK, align: TextStyle['align'] = 'left', width = 515): TextSlot => ({
  frame: f(40, 36, width, 48),
  style: { role: 'title', fontSize: 28, color, align, bold: true, lineHeight: 1.2 },
  minFontSize: 20,
});

const captionSlot = (frame: Frame, fontSize = 19, color = SOFT_INK, align: TextStyle['align'] = 'left'): TextSlot => ({
  frame,
  style: { role: 'hand', fontSize, color, align, bold: false, lineHeight: 1.6 },
  minFontSize: 12,
});

export const TEMPLATES: readonly Template[] = [
  // ---------- 3 photos ----------
  {
    id: 't3-scatter',
    name: 'Polaroid scatter',
    photoCount: 3,
    background: '#FBF6EE',
    photos: [polaroid(f(44, 112, 320, 240, -3)), polaroid(f(318, 150, 236, 314, 4)), polaroid(f(56, 396, 300, 300, 2))],
    date: dateSlot(),
    caption: captionSlot(f(376, 500, 172, 250), 19),
    decor: [
      { stickerId: 'tape', frame: f(160, 96, 96, 28, -6), color: '#E8C5A0B3' },
      { stickerId: 'heart', frame: f(510, 130, 36, 36, 12), color: '#E8968C' },
      { stickerId: 'sparkle', frame: f(62, 730, 30, 30), color: '#E9B949' },
      { stickerId: 'sparkle', frame: f(98, 760, 18, 18), color: '#E9B949' },
    ],
  },
  {
    id: 't3-hero',
    name: 'Hero + two',
    photoCount: 3,
    background: '#FFFFFF',
    photos: [clean(f(40, 104, 515, 330)), clean(f(40, 448, 251, 251)), clean(f(304, 448, 251, 251))],
    date: dateSlot(INK, 'left', 470),
    caption: captionSlot(f(40, 716, 515, 100), 20),
    decor: [{ stickerId: 'star', frame: f(527, 46, 26, 26), color: '#E9B949' }],
  },

  // ---------- 4 photos ----------
  {
    id: 't4-grid',
    name: 'Grid of four',
    photoCount: 4,
    background: '#F6F1EA',
    photos: [clean(f(40, 104, 251, 290)), clean(f(304, 104, 251, 290)), clean(f(40, 408, 251, 290)), clean(f(304, 408, 251, 290))],
    date: dateSlot(INK, 'center'),
    caption: captionSlot(f(60, 716, 475, 100), 20, SOFT_INK, 'center'),
    decor: [{ stickerId: 'heart', frame: f(282, 386, 30, 30), color: '#E8968C' }],
  },
  {
    id: 't4-film',
    name: 'Hero + film strip',
    photoCount: 4,
    background: '#FBF6EE',
    photos: [clean(f(40, 104, 320, 470)), clean(f(374, 104, 181, 148)), clean(f(374, 265, 181, 148)), clean(f(374, 426, 181, 148))],
    date: dateSlot(),
    caption: captionSlot(f(40, 596, 515, 150), 20),
    decor: [
      { stickerId: 'cloud', frame: f(474, 760, 64, 46), color: '#A9C4D8' },
      { stickerId: 'sparkle', frame: f(446, 786, 22, 22), color: '#E9B949' },
    ],
  },
  {
    id: 't4-scatter',
    name: 'Polaroid four',
    photoCount: 4,
    background: '#F3EEF5',
    photos: [
      polaroid(f(44, 108, 262, 210, -4)),
      polaroid(f(318, 112, 236, 236, 3)),
      polaroid(f(52, 340, 236, 314, 2)),
      polaroid(f(300, 382, 250, 188, -3)),
    ],
    date: dateSlot('#5B4B6B'),
    caption: captionSlot(f(306, 600, 244, 200), 19, '#6E6078'),
    decor: [
      { stickerId: 'tape', frame: f(392, 96, 90, 26, 8), color: '#C9B6E4B3' },
      { stickerId: 'moon', frame: f(84, 700, 38, 38, -10), color: '#C9B6E4' },
      { stickerId: 'star', frame: f(132, 748, 20, 20, 8), color: '#E9B949' },
    ],
  },

  // ---------- 5 photos ----------
  {
    id: 't5-mosaic',
    name: 'Hero + grid',
    photoCount: 5,
    background: '#FFFFFF',
    photos: [
      clean(f(40, 104, 515, 290)),
      clean(f(40, 408, 251, 150)),
      clean(f(304, 408, 251, 150)),
      clean(f(40, 572, 251, 150)),
      clean(f(304, 572, 251, 150)),
    ],
    date: dateSlot(INK, 'left', 470),
    caption: captionSlot(f(40, 738, 515, 80), 18),
    decor: [{ stickerId: 'heart', frame: f(525, 46, 26, 26), color: '#E8968C' }],
  },
  {
    id: 't5-scatter',
    name: 'Scatter of five',
    photoCount: 5,
    background: '#FBF6EE',
    photos: [
      polaroid(f(40, 100, 230, 172, -3)),
      polaroid(f(290, 96, 256, 192, 2)),
      polaroid(f(186, 300, 220, 220, -1)),
      polaroid(f(44, 470, 200, 260, 3)),
      polaroid(f(330, 520, 210, 158, -4)),
    ],
    date: dateSlot(),
    caption: captionSlot(f(276, 700, 272, 120), 18),
    decor: [
      { stickerId: 'tape', frame: f(220, 290, 80, 24, -12), color: '#E8C5A0B3' },
      { stickerId: 'star', frame: f(512, 300, 30, 30, 10), color: '#E9B949' },
      { stickerId: 'heart', frame: f(66, 752, 30, 30, -8), color: '#E8968C' },
    ],
  },
];

export function templatesFor(photoCount: number): Template[] {
  return TEMPLATES.filter((t) => t.photoCount === photoCount);
}

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export const SUPPORTED_PHOTO_COUNTS = [...new Set(TEMPLATES.map((t) => t.photoCount))].sort((a, b) => a - b);
