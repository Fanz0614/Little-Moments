import { useEffect, useMemo, useState } from 'react';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useSQLiteContext } from 'expo-sqlite';
import { getPhotos, type PhotoRow } from '@/db/repo';
import { docUri } from '@/photos/files';

const DISPOSE_DELAY_MS = 5000;

export type PhotoImages = Map<string, { image: SkImage; row: PhotoRow }>;

/**
 * Decode the working copies for a set of photo ids into Skia images.
 * Images are disposed when the set changes or the screen unmounts so GPU
 * memory is returned promptly instead of waiting for GC.
 */
export function usePhotoImages(photoIds: readonly string[]): { images: PhotoImages; loading: boolean } {
  const db = useSQLiteContext();
  const key = useMemo(() => [...new Set(photoIds)].sort().join('|'), [photoIds]);
  const [state, setState] = useState<{ key: string; images: PhotoImages }>({ key: '', images: new Map() });

  useEffect(() => {
    let cancelled = false;
    const loaded: PhotoImages = new Map();
    (async () => {
      const ids = key ? key.split('|') : [];
      const rows = await getPhotos(db, ids);
      for (const id of ids) {
        const row = rows.get(id);
        if (!row) continue;
        try {
          const data = await Skia.Data.fromURI(docUri(row.workPath));
          const image = Skia.Image.MakeImageFromEncoded(data);
          if (image) loaded.set(id, { image, row });
        } catch (e) {
          console.warn('failed to load photo', id, e);
        }
        if (cancelled) break;
      }
      if (cancelled) {
        loaded.forEach((v) => v.image.dispose());
      } else {
        setState({ key, images: loaded });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, key]);

  // Dispose the previous set once a new one replaces it, and on unmount. The
  // delay lets an in-flight offscreen render (thumbnail/export) finish with
  // images it already holds instead of drawing freed GPU memory.
  useEffect(() => {
    const current = state.images;
    return () => {
      setTimeout(() => current.forEach((v) => v.image.dispose()), DISPOSE_DELAY_MS);
    };
  }, [state.images]);

  return { images: state.images, loading: state.key !== key };
}
