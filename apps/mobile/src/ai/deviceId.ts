import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { getSetting, setSetting } from '@/db/repo';

/**
 * Anonymous id for the API's per-device rate limit. Random, not derived from
 * the device, and only a rate-limit key: the server must not trust it as an
 * identity (deploy gate: App Attest or sign-in first).
 */
export async function getDeviceId(db: SQLiteDatabase): Promise<string> {
  const existing = await getSetting(db, 'deviceId');
  if (existing) return existing;
  const id = randomUUID();
  await setSetting(db, 'deviceId', id);
  return id;
}
