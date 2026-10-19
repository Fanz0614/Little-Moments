// @ts-nocheck
/**
 * Lets app code that imports '@shopify/react-native-skia' run in Node:
 * re-exports the headless (CanvasKit) build, adds the few helpers the app uses
 * that headless doesn't export, and injects a bundled font into paragraphs
 * (CanvasKit has no system fonts, unlike iOS).
 * Imported by relative path: an alias on the package name would also capture
 * this subpath.
 */
import * as headless from '../../node_modules/@shopify/react-native-skia/lib/commonjs/headless/index.js';
export * from '../../node_modules/@shopify/react-native-skia/lib/commonjs/headless/index.js';

const S = () => headless.getSkiaExports().Skia;

export const Skia: any = new Proxy(
  {},
  {
    get(_t, k) {
      if (k === 'ParagraphBuilder') {
        return {
          Make: (style, provider) => {
            const b = S().ParagraphBuilder.Make(style, provider ?? (globalThis as any).__previewFonts);
            const push = b.pushStyle.bind(b);
            b.pushStyle = (st, ...rest) => {
              push({ ...st, fontFamilies: [...(st.fontFamilies ?? []), 'Preview'] }, ...rest);
              return b;
            };
            return b;
          },
        };
      }
      return S()[k];
    },
  },
);

export const rect = (x, y, w, h) => S().XYWHRect(x, y, w, h);
export const rrect = (r, rx, ry) => S().RRectXY(r, rx, ry);
export const vec = (x = 0, y = 0) => S().Point(x, y);
