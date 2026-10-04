'use client';
import { encodeUnderBudget } from './encodeUnderBudget';

/** Resize an image File in the browser and encode it as a compact data URI
 *  (WebP where the browser can encode it, JPEG on Safari — see
 *  encodeUnderBudget). FLIX stores show art inline in member_profiles (see
 *  validateImageRef), so this keeps uploads small enough to live in a DB text
 *  column — no Supabase Storage bucket or legacy service key required. */
export async function fileToDataUrl(file: File, maxDim: number, maxChars: number): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('file must be an image');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('could not process image (canvas unavailable)');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return encodeUnderBudget((type, quality) => canvas.toDataURL(type, quality), maxChars);
}
