import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { deletePhotoRows, listPages, orphanPhotos } from '@/db/repo';
import { BABY_DIR, PAGE_DIR, deleteIfExists } from './files';

/**
 * Photos are imported before the user chooses 3–5 of them, so unchosen ones
 * (and photos of deleted pages) become orphans. Remove their files and rows.
 * Also removes page thumbnails no page row points at, and unused profile photos.
 */
export async function cleanupOrphans(
  db: SQLiteDatabase,
  // Grace period so photos imported by a "New page" flow that is still open are never touched.
  minAgeMs = 30 * 60 * 1000,
): Promise<{ photos: number; thumbs: number; avatars: number }> {
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
  // Profile photos picked in a form that was then cancelled, or replaced ones.
  // Only files older than the grace period, so a form still open is never affected.
  let avatars = 0;
  const babyDir = new Directory(Paths.document, BABY_DIR);
  if (babyDir.exists) {
    const rows = await db.getAllAsync<{ avatar_path: string | null }>('SELECT avatar_path FROM babies');
    const keep = new Set(rows.map((r) => r.avatar_path).filter(Boolean));
    for (const entry of babyDir.list()) {
      if (!(entry instanceof File)) continue;
      const rel = `${BABY_DIR}/${entry.name}`;
      if (!keep.has(rel) && (entry.modificationTime ?? 0) < cutoff) {
        entry.delete();
        avatars++;
      }
    }
  }
  return { photos: orphans.length, thumbs, avatars };
}
