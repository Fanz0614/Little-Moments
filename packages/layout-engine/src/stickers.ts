/**
 * Built-in vector stickers. Each path is drawn in a 24 x 24 viewBox and
 * stretched to the layer frame, so they stay sharp at any export resolution
 * and need no image assets.
 */
export type StickerDef = { id: string; name: string; path: string; defaultColor: string };

export const STICKERS: readonly StickerDef[] = [
  {
    id: 'heart',
    name: '爱心',
    path: 'M12 21s-7.5-4.6-9.6-9.3C.9 8.1 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.3 1.8-2.1 3.3-3.3 5.4-3.3 3.6 0 5.7 3.6 4.2 7.2C19.5 16.4 12 21 12 21z',
    defaultColor: '#E8968C',
  },
  {
    id: 'star',
    name: '星星',
    path: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6-4.9-4.5 6.6-.8z',
    defaultColor: '#E9B949',
  },
  {
    id: 'sparkle',
    name: '闪光',
    path: 'M12 2c.7 5.2 3.3 8.3 9 10-5.7 1.7-8.3 4.8-9 10-.7-5.2-3.3-8.3-9-10 5.7-1.7 8.3-4.8 9-10z',
    defaultColor: '#E9B949',
  },
  {
    id: 'cloud',
    name: '云朵',
    path: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 9.6 4.75 4.75 0 0 0 7 19z',
    defaultColor: '#A9C4D8',
  },
  {
    id: 'moon',
    name: '月亮',
    path: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
    defaultColor: '#C9B6E4',
  },
  {
    id: 'tape',
    name: '胶带',
    path: 'M1 7l1.5-1L4 7l1.5-1h13L20 7l1.5-1L23 7v10l-1.5 1-1.5-1-1.5 1h-13L4 17l-1.5 1L1 17z',
    defaultColor: '#E8C5A0B3',
  },
];

export function getSticker(id: string): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}
