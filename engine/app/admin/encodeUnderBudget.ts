/** Pick the smallest acceptable encoding of a canvas, stepping quality down
 *  until the data URI fits `maxChars`.
 *
 *  WebP is preferred, but Safari (macOS + iOS) cannot ENCODE WebP: toDataURL
 *  silently hands back a PNG — which ignores the quality knob and, for a
 *  photo, is several times over every budget. So if the probe shows the
 *  browser didn't honor image/webp, we run the ladder as JPEG instead
 *  (supported everywhere; alpha flattens to black, which matches the site).
 *  Extracted from fileToDataUrl so this browser matrix is unit-testable. */
export function encodeUnderBudget(
  encode: (type: string, quality: number) => string,
  maxChars: number,
): string {
  const type = encode('image/webp', 0.82).startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';
  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const url = encode(type, quality);
    if (url.length <= maxChars) return url;
  }
  throw new Error('image is too detailed to compress under the size limit — try a smaller crop');
}
