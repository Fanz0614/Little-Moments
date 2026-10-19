import type { SQLiteDatabase } from 'expo-sqlite';
import { parseStoredPage, type PageDocument } from '@lm/page-schema';

export type PhotoRow = {
  id: string;
  assetId: string | null;
  workPath: string;
  thumbPath: string;
  width: number;
  height: number;
  takenAt: number | null;
  createdAt: number;
};

export type PageSummary = {
  id: string;
  journalDate: string;
  thumbPath: string | null;
  updatedAt: number;
};

type PhotoDbRow = {
  id: string;
  asset_id: string | null;
  work_path: string;
  thumb_path: string;
  width: number;
  height: number;
  taken_at: number | null;
  created_at: number;
};

const toPhoto = (r: PhotoDbRow): PhotoRow => ({
  id: r.id,
  assetId: r.asset_id,
  workPath: r.work_path,
  thumbPath: r.thumb_path,
  width: r.width,
  height: r.height,
  takenAt: r.taken_at,
  createdAt: r.created_at,
});

export async function insertPhoto(db: SQLiteDatabase, p: PhotoRow): Promise<void> {
  await db.runAsync(
    `INSERT INTO photos (id, asset_id, work_path, thumb_path, width, height, taken_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id,
    p.assetId,
    p.workPath,
    p.thumbPath,
    p.width,
    p.height,
    p.takenAt,
    p.createdAt,
  );
}

export async function getPhotos(db: SQLiteDatabase, ids: readonly string[]): Promise<Map<string, PhotoRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.getAllAsync<PhotoDbRow>(
    `SELECT * FROM photos WHERE id IN (${ids.map(() => '?').join(',')})`,
    [...ids],
  );
  return new Map(rows.map((r) => [r.id, toPhoto(r)]));
}

export async function savePage(db: SQLiteDatabase, doc: PageDocument, thumbPath?: string | null): Promise<void> {
  await db.runAsync(
    `INSERT INTO pages (id, journal_date, doc_json, thumb_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       journal_date = excluded.journal_date,
       doc_json = excluded.doc_json,
       thumb_path = COALESCE(excluded.thumb_path, pages.thumb_path),
       updated_at = excluded.updated_at`,
    doc.id,
    doc.journalDate,
    JSON.stringify(doc),
    thumbPath ?? null,
    doc.createdAt,
    doc.updatedAt,
  );
}

export async function setPageThumb(db: SQLiteDatabase, pageId: string, thumbPath: string): Promise<void> {
  await db.runAsync('UPDATE pages SET thumb_path = ? WHERE id = ?', thumbPath, pageId);
}

export async function loadPage(db: SQLiteDatabase, id: string): Promise<PageDocument | null> {
  const row = await db.getFirstAsync<{ doc_json: string }>('SELECT doc_json FROM pages WHERE id = ?', id);
  return row ? parseStoredPage(row.doc_json) : null;
}

export async function listPages(db: SQLiteDatabase): Promise<PageSummary[]> {
  const rows = await db.getAllAsync<{ id: string; journal_date: string; thumb_path: string | null; updated_at: number }>(
    'SELECT id, journal_date, thumb_path, updated_at FROM pages ORDER BY journal_date DESC, created_at DESC',
  );
  return rows.map((r) => ({ id: r.id, journalDate: r.journal_date, thumbPath: r.thumb_path, updatedAt: r.updated_at }));
}

export async function deletePage(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM pages WHERE id = ?', id);
}

/** Photos no page references any more (candidates for file cleanup). */
export async function orphanPhotos(db: SQLiteDatabase): Promise<PhotoRow[]> {
  const pages = await db.getAllAsync<{ doc_json: string }>('SELECT doc_json FROM pages');
  const used = new Set<string>();
  for (const p of pages) {
    for (const l of parseStoredPage(p.doc_json).layers) if (l.type === 'photo') used.add(l.photoId);
  }
  const all = await db.getAllAsync<PhotoDbRow>('SELECT * FROM photos');
  return all.filter((r) => !used.has(r.id)).map(toPhoto);
}

export async function deletePhotoRows(db: SQLiteDatabase, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.runAsync(`DELETE FROM photos WHERE id IN (${ids.map(() => '?').join(',')})`, [...ids]);
}
