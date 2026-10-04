export type ProfileSetupLike = {
  avatar_url?: string | null;
  tile_url?: string | null;
  banner_url?: string | null;
  banner_preset?: string | null;
  card_url?: string | null;
  hero_desktop_url?: string | null;
  hero_mobile_url?: string | null;
  tagline?: string | null;
  description?: string | null;
};

/** Pure validation shared by the route and unit tests. A null source means
 * unlink the targets and restore their own saved setup. */
export function validateProfileLinkInput(
  source: string | null,
  targets: string[],
): string | null {
  if (!Array.isArray(targets) || targets.length === 0) return 'at least one target member is required';
  const cleaned = targets.map(target => target?.trim()).filter(Boolean);
  if (cleaned.length !== targets.length) return 'target members must be non-empty';
  if (new Set(cleaned).size !== cleaned.length) return 'target members must be distinct';
  const normalizedSource = source?.trim() || null;
  if (source != null && !normalizedSource) return 'source member must be non-empty';
  if (normalizedSource && cleaned.includes(normalizedSource)) return 'the source member cannot also be a target';
  return null;
}

/** Human-readable preview labels for the admin confirmation card. */
export function profileSetupParts(profile: ProfileSetupLike): string[] {
  const parts: string[] = [];
  if (profile.avatar_url) parts.push('pfp');
  if (profile.tile_url) parts.push('profile tile');
  if (profile.banner_url || profile.card_url || profile.hero_desktop_url || profile.hero_mobile_url) parts.push('show artwork');
  if (profile.banner_preset) parts.push('fallback gradient');
  if (profile.tagline || profile.description) parts.push('show copy');
  return parts;
}
