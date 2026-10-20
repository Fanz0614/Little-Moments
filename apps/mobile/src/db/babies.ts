import type { SQLiteDatabase } from 'expo-sqlite';
import type { Baby, BabyFields, Gender } from '@/baby/profile';

type BabyRow = {
  id: string;
  nickname: string;
  name: string | null;
  birthday: string;
  gender: string;
  avatar_path: string | null;
  created_at: number;
  updated_at: number;
};

const toBaby = (r: BabyRow): Baby => ({
  id: r.id,
  nickname: r.nickname,
  name: r.name,
  birthday: r.birthday,
  gender: (['girl', 'boy'].includes(r.gender) ? r.gender : 'unspecified') as Gender,
  avatarPath: r.avatar_path,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Phase 1 UI supports one baby: the earliest-created profile. */
export async function getPrimaryBaby(db: SQLiteDatabase): Promise<Baby | null> {
  const row = await db.getFirstAsync<BabyRow>('SELECT * FROM babies ORDER BY created_at ASC LIMIT 1');
  return row ? toBaby(row) : null;
}

export async function getBaby(db: SQLiteDatabase, id: string): Promise<Baby | null> {
  const row = await db.getFirstAsync<BabyRow>('SELECT * FROM babies WHERE id = ?', id);
  return row ? toBaby(row) : null;
}

/**
 * Creates a profile and, in the same transaction, assigns every page that
 * has no baby yet (pages made before profiles existed) to it.
 */
export async function createBaby(db: SQLiteDatabase, id: string, fields: BabyFields, now: number): Promise<Baby> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO babies (id, nickname, name, birthday, gender, avatar_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      fields.nickname,
      fields.name,
      fields.birthday,
      fields.gender,
      fields.avatarPath,
      now,
      now,
    );
    await db.runAsync('UPDATE pages SET baby_id = ? WHERE baby_id IS NULL', id);
  });
  return { ...fields, id, createdAt: now, updatedAt: now };
}

export async function updateBaby(db: SQLiteDatabase, id: string, fields: BabyFields, now: number): Promise<void> {
  await db.runAsync(
    `UPDATE babies SET nickname = ?, name = ?, birthday = ?, gender = ?, avatar_path = ?, updated_at = ? WHERE id = ?`,
    fields.nickname,
    fields.name,
    fields.birthday,
    fields.gender,
    fields.avatarPath,
    now,
    id,
  );
}
