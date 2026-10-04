import { describe, expect, it } from 'vitest';
import { encodeUnderBudget } from '../app/admin/encodeUnderBudget';

/** Fake canvas encoders. Chrome honors image/webp; Safari silently returns a
 *  PNG (and PNG ignores the quality knob — same huge output every step). */
const chromeEncode = (type: string, q: number) =>
  type === 'image/webp'
    ? `data:image/webp;base64,${'w'.repeat(Math.round(500_000 * q))}`
    : `data:image/jpeg;base64,${'j'.repeat(Math.round(400_000 * q))}`;

const safariEncode = (type: string, q: number) =>
  type === 'image/webp'
    ? `data:image/png;base64,${'p'.repeat(4_000_000)}` // webp unsupported → PNG, quality ignored
    : `data:image/jpeg;base64,${'j'.repeat(Math.round(400_000 * q))}`;

describe('encodeUnderBudget', () => {
  it('uses webp when the browser supports it', () => {
    const url = encodeUnderBudget(chromeEncode, 1_350_000);
    expect(url).toMatch(/^data:image\/webp/);
  });

  it('falls back to jpeg when webp encoding is unsupported (Safari)', () => {
    // Without the fallback this threw for every photo: the PNG stand-in
    // exceeds the budget at every quality step.
    const url = encodeUnderBudget(safariEncode, 1_350_000);
    expect(url).toMatch(/^data:image\/jpeg/);
    expect(url.length).toBeLessThanOrEqual(1_350_000);
  });

  it('steps quality down until the image fits', () => {
    const url = encodeUnderBudget(chromeEncode, 300_000);
    expect(url.length).toBeLessThanOrEqual(300_000);
  });

  it('throws only when even the lowest quality cannot fit', () => {
    const hugeEncode = (type: string) =>
      type === 'image/webp' ? `data:image/webp;base64,${'w'.repeat(2_000_000)}` : `data:image/jpeg;base64,${'j'.repeat(2_000_000)}`;
    expect(() => encodeUnderBudget(hugeEncode, 1_350_000)).toThrow(/smaller crop/i);
  });
});
