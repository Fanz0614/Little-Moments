import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { insertPhoto, type PhotoRow } from '@/db/repo';
import { PHOTO_DIR, docFile, ensureDirs } from './files';
import { exifTimestamp } from './dates';

/**
 * Memory budget, the main risk found in research: never hold a 48 MP original
 * in a canvas. On import every photo is decoded once, downsampled while
 * decoding (maxWidth/maxHeight), and saved as:
 *   work  — long edge WORK_EDGE, used by the editor and for export
 *   thumb — long edge THUMB_EDGE, used by the selection grid
 * The original stays in the Photos library; we keep only its asset id.
 *
 * WORK_EDGE 2560 covers a full-width A4 photo at ~250 dpi and a half-page
 * photo at well over 300 dpi. Raise it only after measuring memory on device.
 */
export const WORK_EDGE = 2560;
export const THUMB_EDGE = 480;
export const MAX_PICK = 10;

export type ImportProgress = { done: number; total: number };

export async function pickPhotos(): Promise<ImagePicker.ImagePickerAsset[] | null> {
  // The system picker runs out of process and needs no library permission for
  // what the user picks, which keeps the "photos stay on device" story simple.
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_PICK,
    exif: true,
    quality: 1,
    // 'compatible' asks iOS to hand back JPEG instead of HEIC.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (res.canceled || !res.assets) return null;
  return res.assets;
}

export async function importAssets(
  db: SQLiteDatabase,
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: (p: ImportProgress) => void,
): Promise<PhotoRow[]> {
  ensureDirs();
  const out: PhotoRow[] = [];
  // Sequential on purpose: parallel decodes multiply peak memory.
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]!;
    out.push(await importOne(db, asset));
    onProgress?.({ done: i + 1, total: assets.length });
  }
  return out;
}

async function importOne(db: SQLiteDatabase, asset: ImagePicker.ImagePickerAsset): Promise<PhotoRow> {
  const id = randomUUID();
  const work = await downscale(asset.uri, WORK_EDGE, 0.9);
  const thumb = await downscale(work.uri, THUMB_EDGE, 0.8);

  const workPath = `${PHOTO_DIR}/${id}-work.jpg`;
  const thumbPath = `${PHOTO_DIR}/${id}-thumb.jpg`;
  new File(work.uri).move(docFile(workPath));
  new File(thumb.uri).move(docFile(thumbPath));

  const row: PhotoRow = {
    id,
    assetId: asset.assetId ?? null,
    workPath,
    thumbPath,
    width: work.width,
    height: work.height,
    takenAt: exifTimestamp(asset.exif),
    createdAt: Date.now(),
  };
  await insertPhoto(db, row);
  return row;
}

export async function downscale(uri: string, longEdge: number, compress: number) {
  // Downsample during decode so the full-resolution bitmap is never allocated.
  const ctx = ImageManipulator.manipulate(uri, { maxWidth: longEdge, maxHeight: longEdge });
  const ref = await ctx.renderAsync();
  try {
    return await ref.saveAsync({ format: SaveFormat.JPEG, compress });
  } finally {
    ref.release();
    ctx.release();
  }
}

export { exifTimestamp, localDateString, suggestJournalDate } from './dates';
