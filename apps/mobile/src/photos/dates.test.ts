import { describe, expect, it } from 'vitest';
import { exifTimestamp, localDateString, suggestJournalDate } from './dates';

describe('exifTimestamp', () => {
  it('reads DateTimeOriginal as local time', () => {
    const t = exifTimestamp({ DateTimeOriginal: '2026:10:19 14:22:01' })!;
    const d = new Date(t);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 19, 14, 22]);
  });
  it('falls back to DateTimeDigitized, then DateTime', () => {
    expect(exifTimestamp({ DateTime: '2026:01:02 03:04:05' })).not.toBeNull();
  });
  it('returns null for missing or malformed values', () => {
    expect(exifTimestamp(null)).toBeNull();
    expect(exifTimestamp({ DateTimeOriginal: 'yesterday' })).toBeNull();
    expect(exifTimestamp({ DateTimeOriginal: 12345 })).toBeNull();
  });
});

describe('suggestJournalDate', () => {
  const at = (s: string) => ({ takenAt: exifTimestamp({ DateTimeOriginal: s }) });
  it('picks the day most photos were taken', () => {
    expect(suggestJournalDate([at('2026:10:18 23:50:00'), at('2026:10:19 08:00:00'), at('2026:10:19 09:00:00')])).toBe('2026-10-19');
  });
  it('breaks ties towards the later day', () => {
    expect(suggestJournalDate([at('2026:10:18 10:00:00'), at('2026:10:19 10:00:00')])).toBe('2026-10-19');
  });
  it('uses today when no photo has EXIF', () => {
    const now = new Date(2026, 9, 19, 12).getTime();
    expect(suggestJournalDate([{ takenAt: null }], now)).toBe(localDateString(now));
  });
});
