import { Skia, TextAlign, FontWeight, type SkParagraph } from '@shopify/react-native-skia';
import type { FontRole, TextStyle } from '@lm/page-schema';
import type { MeasureText } from '@lm/layout-engine';

/**
 * Phase 1 uses system fonts only (no bundled CJK font: those are 5–20 MB).
 * Skia walks the family list per glyph, so Latin text gets the first family
 * and Chinese falls through to PingFang SC. Android names are appended so the
 * app still renders there, untuned.
 */
const FAMILIES: Record<FontRole, string[]> = {
  title: ['Georgia', 'PingFang SC', 'serif'],
  body: ['Helvetica Neue', 'PingFang SC', 'sans-serif'],
  hand: ['Chalkboard SE', 'PingFang SC', 'casual', 'sans-serif'],
};

const ALIGN = { left: TextAlign.Left, center: TextAlign.Center, right: TextAlign.Right } as const;

export function makeParagraph(text: string, style: TextStyle, width: number): SkParagraph {
  const p = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[style.align] })
    .pushStyle({
      color: Skia.Color(style.color),
      fontFamilies: FAMILIES[style.role],
      fontSize: style.fontSize,
      fontStyle: { weight: style.bold ? FontWeight.Bold : FontWeight.Normal },
      heightMultiplier: style.lineHeight,
    })
    .addText(text)
    .pop()
    .build();
  p.layout(width);
  return p;
}

/** The real measurer injected into the layout engine. */
export const skiaMeasureText: MeasureText = (text, style, maxWidth) => {
  const p = makeParagraph(text, style, maxWidth);
  const h = p.getHeight();
  p.dispose();
  return h;
};
