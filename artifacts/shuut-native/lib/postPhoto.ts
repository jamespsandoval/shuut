import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

type PostPhotoType = 'image/jpeg' | 'image/png' | 'image/webp';
const extensions: Record<PostPhotoType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Expo's web picker returns a browser File; expo-file-system File is native-only. */
export async function prepareWebPostPhoto(asset: ImagePickerAsset, prefix: string) {
  const file = asset.file;
  if (!file) throw new Error('Could not read the selected photo. Please choose it again.');
  if (file.size < 1 || file.size > 15_000_000) throw new Error('Choose a photo under 15MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const type: PostPhotoType | null =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
    : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
      && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 ? 'image/png'
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp'
    : null;
  if (!type) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  return { file, contentType: type, name: `${prefix}.${extensions[type]}` };
}

export async function prepareNativePostPhoto(
  asset: ImagePickerAsset,
  prefix: string,
  options: { optimize?: boolean } = {},
) {
  let file = new File(asset.uri);
  if (!file.exists) throw new Error('Selected photo is no longer available on this device.');
  if (file.size < 1 || file.size > 15_000_000) throw new Error('Choose a photo under 15MB.');
  // The picker may retain the original HEIC MIME type after iOS exports a
  // compatible JPEG. Detect the actual bytes rather than guessing from metadata.
  const detectType = async (input: File) => {
    const bytes = await input.bytes();
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
    const type: PostPhotoType | null =
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
      : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 ? 'image/png'
      : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp'
      : null;
    return { type, brand: ascii(4, 12) };
  };
  let { type, brand } = await detectType(file);
  let convertedHeic = false;
  if (!type && brand.startsWith('ftyp') && /^(heic|heif|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(brand.slice(4))) {
    try {
      const maxEdge = Math.max(asset.width, asset.height);
      const actions: ImageManipulator.Action[] = maxEdge > 2048
        ? [{ resize: asset.width >= asset.height ? { width: 2048 } : { height: 2048 } }]
        : [];
      const converted = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.82,
      });
      file = new File(converted.uri);
      if (!file.exists || file.size < 1 || file.size > 15_000_000) {
        throw new Error('Converted photo is unavailable or too large.');
      }
      ({ type, brand } = await detectType(file));
      if (type !== 'image/jpeg') throw new Error('Converted photo is not JPEG.');
      convertedHeic = true;
    } catch {
      throw new Error('This iPhone photo could not be converted to JPEG. Export it as JPEG from Photos and try again.');
    }
  }
  if (!type) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  if (options.optimize && !convertedHeic && (type === 'image/jpeg' || type === 'image/png')) {
    const maxEdge = Math.max(asset.width, asset.height);
    if (maxEdge > 2048 || (type === 'image/jpeg' && file.size > 750_000)) {
      try {
        const actions: ImageManipulator.Action[] = maxEdge > 2048
          ? [{ resize: asset.width >= asset.height ? { width: 2048 } : { height: 2048 } }]
          : [];
        const optimized = await ImageManipulator.manipulateAsync(file.uri, actions, {
          format: type === 'image/png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
          compress: 0.82,
        });
        const candidate = new File(optimized.uri);
        if (candidate.exists && candidate.size > 0 && candidate.size < file.size &&
          (await detectType(candidate)).type === type) {
          file = candidate;
        }
      } catch (error) {
        // Keep the valid original if optional optimization is unavailable.
        console.warn('Could not optimize photo before upload', error);
      }
    }
  }
  return { file, contentType: type, name: `${prefix}.${extensions[type]}` };
}

export function photoUploadError(status: number, body: string): Error {
  let detail = '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
      detail = parsed.error;
    }
  } catch { /* Non-JSON upload error. */ }
  if (detail === 'Upload content does not match its declared type') {
    return new Error('This photo is not in a supported format. Export it as JPEG and try again.');
  }
  if (detail === 'Image could not be processed') {
    return new Error('This photo could not be processed. Export it as JPEG and try again.');
  }
  return new Error(detail || `Photo upload failed (${status}). Please try again.`);
}