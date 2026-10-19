/** Pure date helpers (no Expo imports) so they can be unit tested in Node. */
type HasTakenAt = { takenAt: number | null };

/** EXIF "2026:10:19 14:22:01" is local time with no zone; read it as local. */
export function exifTimestamp(exif: Record<string, unknown> | null | undefined): number | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as [number, number, number, number, number, number, number];
  const t = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isFinite(t) ? t : null;
}

export function localDateString(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The day most of the selected photos were taken; today if none have EXIF. */
export function suggestJournalDate(photos: readonly HasTakenAt[], now = Date.now()): string {
  const counts = new Map<string, number>();
  for (const p of photos) {
    if (p.takenAt == null) continue;
    const day = localDateString(p.takenAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [day, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && day > best)) {
      best = day;
      bestN = n;
    }
  }
  return best ?? localDateString(now);
}
