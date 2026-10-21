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
  /** AI title the user accepted; null for pages written in their own words. */
  title: string | null;
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

/**
 * Upsert. `babyId` is only written on insert or when given; later saves from
 * the editor (which don't know the baby) keep the existing value.
 */
export async function savePage(
  db: SQLiteDatabase,
  doc: PageDocument,
  opts: { thumbPath?: string | null; babyId?: string | null; title?: string | null } = {},
): Promise<void> {
  await db.runAsync(
    `INSERT INTO pages (id, journal_date, doc_json, thumb_path, baby_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       journal_date = excluded.journal_date,
       doc_json = excluded.doc_json,
       thumb_path = COALESCE(excluded.thumb_path, pages.thumb_path),
       baby_id = COALESCE(excluded.baby_id, pages.baby_id),
       title = COALESCE(excluded.title, pages.title),
       updated_at = excluded.updated_at`,
    doc.id,
    doc.journalDate,
    JSON.stringify(doc),
    opts.thumbPath ?? null,
    opts.babyId ?? null,
    opts.title ?? null,
    doc.createdAt,
    doc.updatedAt,
  );
}

export async function setPageThumb(db: SQLiteDatabase, pageId: string, thumbPath: string): Promise<void> {
  await db.runAsync('UPDATE pages SET thumb_path = ? WHERE id = ?', thumbPath, pageId);
}

export async function loadPage(db: SQLiteDatabase, id: string): Promise<{ doc: PageDocument; babyId: string | null } | null> {
  const row = await db.getFirstAsync<{ doc_json: string; baby_id: string | null }>(
    'SELECT doc_json, baby_id FROM pages WHERE id = ?',
    id,
  );
  return row ? { doc: parseStoredPage(row.doc_json), babyId: row.baby_id } : null;
}

export async function listPages(db: SQLiteDatabase): Promise<PageSummary[]> {
  const rows = await db.getAllAsync<{ id: string; journal_date: string; thumb_path: string | null; title: string | null; updated_at: number }>(
    'SELECT id, journal_date, thumb_path, title, updated_at FROM pages ORDER BY journal_date DESC, created_at DESC',
  );
  return rows.map((r) => ({ id: r.id, journalDate: r.journal_date, thumbPath: r.thumb_path, title: r.title, updatedAt: r.updated_at }));
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
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
