/** Pure selection validation, usable by browser and Node tests. No image bytes stored. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGES = 3;
export const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function selectImages<T extends {type:string;size:number}>(files: T[], existingCount = 0):
  {valid: T[]; warnings: string[]} {
  const warnings: string[] = [];
  const valid: T[] = [];
  for (const file of files) {
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      warnings.push('Only JPEG, PNG and WebP images are supported.'); continue;
    }
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      warnings.push('Each image must be 4 MiB or smaller.'); continue;
    }
    if (existingCount + valid.length >= MAX_IMAGES) {
      warnings.push('Attach at most three images to one message.'); break;
    }
    valid.push(file);
  }
  return {valid, warnings};
}
