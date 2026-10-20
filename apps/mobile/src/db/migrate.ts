import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * SQLite schema. File paths are stored RELATIVE to the app's document
 * directory: on iOS the absolute container path changes between installs and
 * app updates, so an absolute path saved today can point nowhere tomorrow.
 */
const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE photos (
    id TEXT PRIMARY KEY NOT NULL,
    asset_id TEXT,
    work_path TEXT NOT NULL,
    thumb_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    taken_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE pages (
    id TEXT PRIMARY KEY NOT NULL,
    journal_date TEXT NOT NULL,
    doc_json TEXT NOT NULL,
    thumb_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX pages_by_date ON pages (journal_date DESC, created_at DESC);
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    page_id TEXT,
    ts INTEGER NOT NULL,
    data TEXT
  );
  `,
  // v2: baby profile. Ages and zodiac signs are derived from birthday, never stored.
  // pages.baby_id stays NULL for pages made before a profile existed; createBaby() claims them.
  `
  CREATE TABLE babies (
    id TEXT PRIMARY KEY NOT NULL,
    nickname TEXT NOT NULL,
    name TEXT,
    birthday TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'unspecified',
    avatar_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  ALTER TABLE pages ADD COLUMN baby_id TEXT;
  CREATE INDEX pages_by_baby ON pages (baby_id, journal_date DESC);
  `,
];

export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
}
