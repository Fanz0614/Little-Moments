import { Directory, File, Paths } from 'expo-file-system';

/**
 * All stored paths are relative to Paths.document (see db/migrate.ts for why).
 * photos/  working copies + thumbnails (kept, not purged by the OS)
 * pages/   page thumbnails for the home grid
 * baby/    profile photos
 * Exports go to the cache directory: they are shared and then disposable.
 */
export const PHOTO_DIR = 'photos';
export const PAGE_DIR = 'pages';
export const BABY_DIR = 'baby';

export function ensureDirs(): void {
  for (const name of [PHOTO_DIR, PAGE_DIR, BABY_DIR]) {
    const dir = new Directory(Paths.document, name);
    if (!dir.exists) dir.create({ intermediates: true });
  }
}

export function docFile(relPath: string): File {
  return new File(Paths.document, relPath);
}

export function docUri(relPath: string): string {
  return docFile(relPath).uri;
}

export function cacheFile(name: string): File {
  return new File(Paths.cache, name);
}

export function deleteIfExists(relPath: string): void {
  const f = docFile(relPath);
  if (f.exists) f.delete();
}
