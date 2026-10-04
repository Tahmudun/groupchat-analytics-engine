/** Generated "keyart" gradients — the poster/banner fallback when no image
 *  is set. Curated dark, Netflix-graded pairs; ids are stored in
 *  member_profiles.banner_preset / custom_category_entries.poster_preset. */
export const KEYART_PRESETS: Record<string, string> = {
  'crimson-night': 'linear-gradient(160deg, #2b0509 0%, #7a0c14 55%, #e50914 130%)',
  'neon-noir':     'linear-gradient(160deg, #0b0b1a 0%, #2a1458 60%, #7b2ff7 130%)',
  'deep-sea':      'linear-gradient(160deg, #041420 0%, #0a3d4f 60%, #17c3b2 140%)',
  'ember':         'linear-gradient(160deg, #1a0b04 0%, #6b2d0d 55%, #ff8c42 135%)',
  'toxic':         'linear-gradient(160deg, #04140a 0%, #14532d 60%, #46d369 140%)',
  'royal':         'linear-gradient(160deg, #0a0a14 0%, #1e2a78 60%, #4361ee 135%)',
  'magenta-vhs':   'linear-gradient(160deg, #180412 0%, #6d1245 60%, #f72585 135%)',
  'gold-hour':     'linear-gradient(160deg, #140d02 0%, #7d5a0a 60%, #ffd166 140%)',
  'slate-storm':   'linear-gradient(160deg, #0c0f14 0%, #2f3b4c 65%, #8ecae6 150%)',
  'blood-orange':  'linear-gradient(160deg, #1c0602 0%, #8a1e04 60%, #ff4d00 135%)',
  'ultraviolet':   'linear-gradient(160deg, #0f0518 0%, #3c096c 60%, #c77dff 140%)',
  'midnight':      'linear-gradient(160deg, #05080f 0%, #10203f 65%, #274690 140%)',
};

const PRESET_IDS = Object.keys(KEYART_PRESETS);

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic keyart for a seed (username/title); an explicit known
 *  preset id wins, unknown/absent presets fall back to the seed hash. */
export function keyartFor(seed: string, preset?: string | null): { id: string; css: string } {
  const id = preset && KEYART_PRESETS[preset] ? preset : PRESET_IDS[hashString(seed) % PRESET_IDS.length]!;
  return { id, css: KEYART_PRESETS[id]! };
}
