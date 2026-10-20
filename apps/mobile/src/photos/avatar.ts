import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { BABY_DIR, docFile, ensureDirs } from './files';
import { downscale } from './import';

export const AVATAR_EDGE = 512;

/**
 * Let the user pick and square-crop one photo, then store a 512 px JPEG.
 * Returns the relative path, or null if the user cancelled.
 * Each pick gets a new file name so the RN image cache never shows a stale avatar.
 */
export async function pickAvatar(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return null;

  ensureDirs();
  const small = await downscale(asset.uri, AVATAR_EDGE, 0.85);
  const rel = `${BABY_DIR}/avatar-${randomUUID()}.jpg`;
  new File(small.uri).move(docFile(rel));
  return rel;
}
