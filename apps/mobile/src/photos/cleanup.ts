import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, Paths } from 'expo-file-system';
import { deletePhotoRows, listPages, orphanPhotos } from '@/db/repo';
import { PAGE_DIR, deleteIfExists } from './files';

/**
 * Photos are imported before the user chooses 3–5 of them, so unchosen ones
 * (and photos of deleted pages) become orphans. Remove their files and rows.
 * Also removes page thumbnails no page row points at.
 */
export async function cleanupOrphans(
  db: SQLiteDatabase,
  // Grace period so photos imported by a "新建一页" flow that is still open are never touched.
  minAgeMs = 30 * 60 * 1000,
): Promise<{ photos: number; thumbs: number }> {
  const cutoff = Date.now() - minAgeMs;
  const orphans = (await orphanPhotos(db)).filter((p) => p.createdAt < cutoff);
  for (const p of orphans) {
    deleteIfExists(p.workPath);
    deleteIfExists(p.thumbPath);
  }
  await deletePhotoRows(
    db,
    orphans.map((p) => p.id),
  );

  let thumbs = 0;
  const dir = new Directory(Paths.document, PAGE_DIR);
  if (dir.exists) {
    const keep = new Set((await listPages(db)).map((p) => p.thumbPath).filter(Boolean));
    for (const entry of dir.list()) {
      const rel = `${PAGE_DIR}/${entry.name}`;
      if (!keep.has(rel)) {
        entry.delete();
        thumbs++;
      }
    }
  }
  return { photos: orphans.length, thumbs };
}
