import React from 'react';
import { Group, ImageFormat, drawAsImage } from '@shopify/react-native-skia';
import * as Sharing from 'expo-sharing';
import { PDFDocument } from 'pdf-lib';
import type { PageDocument } from '@lm/page-schema';
import { PageContent } from './PageContent';
import type { PhotoImages } from './useImages';
import { PAGE_DIR, cacheFile, docFile, ensureDirs } from '@/photos/files';

/** 300 dpi: page units are points (1/72 in). A4 -> 2480 x 3508 px. */
export const PRINT_DPI = 300;

async function renderPage(doc: PageDocument, images: PhotoImages, pxPerUnit: number) {
  const width = Math.round(doc.size.width * pxPerUnit);
  const height = Math.round(doc.size.height * pxPerUnit);
  const image = await drawAsImage(
    <Group transform={[{ scale: pxPerUnit }]}>
      <PageContent doc={doc} images={images} />
    </Group>,
    { width, height },
  );
  if (!image) throw new Error('渲染失败：无法创建离屏画布（可能是内存不足）');
  return { image, width, height };
}

async function writeBytes(file: ReturnType<typeof cacheFile>, bytes: Uint8Array) {
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
}

function exportName(doc: PageDocument, ext: string) {
  return `little-moments-${doc.journalDate}-${doc.id.slice(0, 6)}.${ext}`;
}

export type ExportTiming = { renderMs: number; encodeMs: number; bytes: number; width: number; height: number };

export async function exportPng(doc: PageDocument, images: PhotoImages): Promise<{ uri: string; timing: ExportTiming }> {
  const t0 = Date.now();
  const { image, width, height } = await renderPage(doc, images, PRINT_DPI / 72);
  const t1 = Date.now();
  try {
    const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
    const file = cacheFile(exportName(doc, 'png'));
    await writeBytes(file, bytes);
    return { uri: file.uri, timing: { renderMs: t1 - t0, encodeMs: Date.now() - t1, bytes: bytes.length, width, height } };
  } finally {
    image.dispose();
  }
}

/**
 * Phase 1 PDF = one 300 dpi JPEG per page at A4 point size. Goodnotes imports
 * it fine for handwriting on top; the trade-off is that text is not
 * selectable/searchable. Vector text needs font embedding + CJK subsetting,
 * which is Phase 2+ work.
 */
export async function exportPdf(doc: PageDocument, images: PhotoImages): Promise<{ uri: string; timing: ExportTiming }> {
  const t0 = Date.now();
  const { image, width, height } = await renderPage(doc, images, PRINT_DPI / 72);
  const t1 = Date.now();
  try {
    const jpeg = image.encodeToBytes(ImageFormat.JPEG, 92);
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Little Moments ${doc.journalDate}`);
    pdf.setProducer('Little Moments');
    const embedded = await pdf.embedJpg(jpeg);
    const page = pdf.addPage([doc.size.width, doc.size.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: doc.size.width, height: doc.size.height });
    const bytes = await pdf.save();
    const file = cacheFile(exportName(doc, 'pdf'));
    await writeBytes(file, bytes);
    return { uri: file.uri, timing: { renderMs: t1 - t0, encodeMs: Date.now() - t1, bytes: bytes.length, width, height } };
  } finally {
    image.dispose();
  }
}

export async function share(uri: string, mimeType: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('此设备不支持分享');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: '导出手账' });
}

/** Small JPEG for the home grid. Returns the relative path. */
export async function writePageThumb(doc: PageDocument, images: PhotoImages): Promise<string> {
  ensureDirs();
  const { image } = await renderPage(doc, images, 360 / doc.size.width);
  try {
    // A new name per version: the RN image cache keys on the uri.
    const rel = `${PAGE_DIR}/${doc.id}-${doc.updatedAt}.jpg`;
    const file = docFile(rel);
    await writeBytes(file, image.encodeToBytes(ImageFormat.JPEG, 80));
    return rel;
  } finally {
    image.dispose();
  }
}
