/**
 * Cutover gate: proves a restored database is byte-identical to its source.
 *
 * Row counts alone are insufficient — a restore can produce the right number
 * of rows with corrupted content. Each table is reduced to a single md5 over
 * its rows in a deterministic order.
 */

export type ParitySpec = { table: string; columns: string[] };
export type ParityResult = { table: string; n: number; checksum: string };
export type ParityDiff = {
  table: string;
  reason: 'missing' | 'row-count' | 'checksum';
  source?: ParityResult;
  target?: ParityResult;
};

/** Every table holding data that cannot be recomputed from something else.
 *  Materialized views are excluded — they are rebuilt by REFRESH.
 *
 *  Column names verified against the live database 2026-08-26: member_scores
 *  uses `date` (not `day`), mention_sentiments uses `model_version` (not
 *  `model`), and custom_category_entries uses `title` (not `label`). */
export const PARITY_TABLES: ReadonlyArray<ParitySpec> = [
  { table: 'messages',
    columns: ['id', 'sender', 'timestamp_ms', 'content', 'media_type', 'message_type', 'chat_id'] },
  { table: 'reactions',
    columns: ['message_id', 'reactor', 'emoji'] },
  { table: 'members',
    columns: ['username', 'alias', 'bio_name', 'status', 'notes', 'chat_id'] },
  { table: 'member_aliases',
    columns: ['id', 'chat_id', 'member_username', 'alias', 'alias_type'] },
  { table: 'message_mentions',
    columns: ['id', 'chat_id', 'message_id', 'member_username', 'alias_matched'] },
  { table: 'mention_sentiments',
    columns: ['message_id', 'member_username', 'chat_id', 'sentiment_score',
              'sentiment_label', 'confidence', 'model_version'] },
  { table: 'member_scores',
    columns: ['chat_id', 'member_username', 'date', 'score', 'scoring_version'] },
  // `stats` is the entire payload — one JSONB blob per member holding every
  // superlative/persona/streak the Recap feature computed (migration 112).
  // Without it, a restore that nulled or truncated `stats` while leaving
  // chat_id/member_username/stats_version intact would match on both row
  // count and checksum: exactly the failure this gate exists to catch.
  { table: 'member_recap',
    columns: ['chat_id', 'member_username', 'stats', 'stats_version'] },
  // Includes every artwork URL AND every hand-tuned crop/frame/fit column —
  // focus points and zoom (108/109/110) and fit mode (110) are curated data
  // with no source of truth other than this row (a past accidental reset of
  // one member's crop to defaults was recorded as a real loss). A restore
  // that silently reset these to column defaults must be caught.
  { table: 'member_profiles',
    columns: ['chat_id', 'member_username', 'tagline', 'description', 'pinned', 'hidden',
              'avatar_url', 'tile_url', 'banner_url', 'banner_preset',
              'banner_focus_x', 'banner_focus_y', 'banner_zoom',
              'card_url', 'card_fit', 'poster_focus_x', 'poster_focus_y', 'poster_zoom',
              'hero_desktop_url', 'hero_desktop_fit',
              'hero_mobile_url', 'hero_mobile_fit',
              'hero_mobile_focus_x', 'hero_mobile_focus_y', 'hero_mobile_zoom',
              'profile_source_username'] },
  { table: 'chats',
    columns: ['id', 'name', 'platform', 'is_synthetic', 'is_public'] },
  { table: 'custom_categories',
    columns: ['id', 'chat_id', 'title', 'position', 'enabled'] },
  // `poster_url` holds an inline data-URI upload (session 14) -- curated data
  // with no source of truth other than this row, exactly like member_profiles
  // above. Omitting it would let a restore that nulled every custom-row poster
  // still pass on both row count and checksum.
  { table: 'custom_category_entries',
    columns: ['id', 'category_id', 'title', 'subtitle', 'member_username', 'position',
              'poster_url'] },
];

/**
 * One row per table: `n` rows and an order-independent checksum.
 *
 * Deliberately NOT `md5(string_agg(... ORDER BY ...))`. Over 1M `messages`
 * rows that builds a ~100MB text value and sorts it — on the metered source
 * database, which is the resource the cutover depends on. Summing a per-row
 * hash needs no sort and constant memory: one sequential scan.
 *
 * `coalesce(col::text, '\\x00')` keeps NULL distinguishable from the empty
 * string; a plain concatenation would render both as ''.
 */
export function buildChecksumQuery(spec: ParitySpec): string {
  const parts = spec.columns
    .map(c => `coalesce("${c}"::text, '\\x00')`)
    .join(` || '|' || `);
  return `
    SELECT count(*)::bigint AS n,
           coalesce(
             sum(('x' || substr(md5(${parts}), 1, 15))::bit(60)::bigint)::text,
             'empty'
           ) AS checksum
    FROM ${spec.table}`;
}

export function compareParity(
  source: ParityResult[],
  target: ParityResult[],
): ParityDiff[] {
  const byTable = new Map(target.map(t => [t.table, t]));
  const diffs: ParityDiff[] = [];

  for (const s of source) {
    const t = byTable.get(s.table);
    if (!t) { diffs.push({ table: s.table, reason: 'missing', source: s }); continue; }
    if (t.n !== s.n) { diffs.push({ table: s.table, reason: 'row-count', source: s, target: t }); continue; }
    if (t.checksum !== s.checksum) diffs.push({ table: s.table, reason: 'checksum', source: s, target: t });
  }
  return diffs;
}
