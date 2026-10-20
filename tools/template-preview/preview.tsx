// @ts-nocheck
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { Group, LinearGradient, Circle, Rect, vec, drawOffscreen, getSkiaExports, makeOffscreenSurface } from '@shopify/react-native-skia';
import { TEMPLATES, layoutPage } from '@lm/layout-engine';
import { PageContent } from '@/render/PageContent';
import { skiaMeasureText } from '@/render/text';

/**
 * Usage: pnpm --filter @lm/template-preview preview [fontPath] [outDir]
 * fontPath: any .ttf/.otf with CJK glyphs (default: ./NotoSansSC.otf)
 */
const fontPath = process.argv[2] ?? path.join(__dirname, '..', 'NotoSansSC.otf');
const outDir = process.argv[3] ?? path.join(__dirname, '..', 'out');

const PLACEHOLDERS = [
  { id: 'landscape', w: 1600, h: 1200, a: '#E9C4AA', b: '#B08C78' },
  { id: 'portrait', w: 1200, h: 1600, a: '#BACDBE', b: '#789682' },
  { id: 'square', w: 1400, h: 1400, a: '#CDBEE1', b: '#9682AF' },
  { id: 'landscape-2', w: 1600, h: 1200, a: '#F0DCAA', b: '#C8A06E' },
  { id: 'portrait-2', w: 1200, h: 1600, a: '#AAC3DC', b: '#6E8CB4' },
];

const CAPTIONS = {
  3: 'Rolled over all by herself today, looked surprised, then laughed at the camera for ages.',
  4: 'Grandma came to visit. You held on to her finger all afternoon and barely cried.',
  5: 'One month old! Our first family photo with everyone in it, and you slept through the whole thing.',
};

(async () => {
  const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
  globalThis.CanvasKit = await CanvasKitInit({ locateFile: (f) => require.resolve('canvaskit-wasm/bin/full/' + f) });
  const { Skia } = getSkiaExports();

  if (!fs.existsSync(fontPath)) {
    console.error(`Font not found: ${fontPath}\nPass a .ttf/.otf with Chinese glyphs as the first argument.`);
    process.exit(1);
  }
  const tf = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(fontPath))));
  const provider = Skia.TypefaceFontProvider.Make();
  provider.registerFont(tf, 'Preview');
  globalThis.__previewFonts = provider;

  const images = new Map();
  for (const p of PLACEHOLDERS) {
    const image = await drawOffscreen(
      makeOffscreenSurface(p.w, p.h),
      <Group>
        <Rect x={0} y={0} width={p.w} height={p.h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, p.h)} colors={[p.a, p.b]} />
        </Rect>
        <Circle cx={p.w / 2} cy={p.h * 0.42} r={Math.min(p.w, p.h) * 0.16} color="#FAEBDC" />
      </Group>,
    );
    images.set(p.id, { image, row: { id: p.id, width: p.w, height: p.h } });
  }

  fs.mkdirSync(outDir, { recursive: true });
  const SCALE = 1.5;
  for (const t of TEMPLATES) {
    let n = 0;
    const photos = PLACEHOLDERS.slice(0, t.photoCount).map((p) => images.get(p.id).row);
    const { doc, warnings } = layoutPage(
      { pageId: t.id, journalDate: '2026-10-19', photos, caption: CAPTIONS[t.photoCount], ageText: '11 months 30 days', templateId: t.id, now: 1, newId: () => `l${++n}` },
      skiaMeasureText,
    );
    const img = await drawOffscreen(
      makeOffscreenSurface(Math.round(doc.size.width * SCALE), Math.round(doc.size.height * SCALE)),
      <Group transform={[{ scale: SCALE }]}>
        <PageContent doc={doc} images={images} />
      </Group>,
    );
    fs.writeFileSync(path.join(outDir, `${t.id}.png`), img.encodeToBytes());
    console.log(`${t.id}.png`, warnings.length ? JSON.stringify(warnings) : '');
  }
  console.log(`\nWrote ${TEMPLATES.length} previews to ${outDir}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
