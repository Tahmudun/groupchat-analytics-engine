import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/guard';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { FLIX_CHAT } from '@/lib/flix/config';
import { validateImageRef } from '@/lib/flix/storage';
import { clampFrame, DEFAULT_FRAME } from '@/lib/flix/frame';
import { profileSetupParts, validateProfileLinkInput } from '@/lib/admin/profileLinks';

const PSEUDO = 'Instagram User';

/** Members joined with their curated show profile (for the Shows editor). */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const chat = new URL(req.url).searchParams.get('chat') ?? FLIX_CHAT;

  const rows = await sql`
    SELECT m.username, COALESCE(m.alias, m.username) AS display_name,
      COALESCE(w.messages_all_time, 0)::int AS message_count,
      p.avatar_url, p.tile_url, p.banner_url, p.banner_preset, p.tagline, p.description, p.pinned, p.hidden,
      p.banner_focus_x, p.banner_focus_y, p.banner_zoom,
      p.poster_focus_x, p.poster_focus_y, p.poster_zoom,
      p.card_url, p.hero_desktop_url, p.hero_mobile_url,
      p.card_fit, p.hero_desktop_fit, p.hero_mobile_fit,
      p.hero_mobile_focus_x, p.hero_mobile_focus_y, p.hero_mobile_zoom,
      p.profile_source_username
    FROM members m
    LEFT JOIN weekly_stats_v2 w
      ON w.chat_id = m.chat_id AND w.member_username = m.username
    LEFT JOIN resolved_member_profiles p ON p.chat_id = ${chat} AND p.member_username = m.username
    WHERE m.chat_id = ${chat} AND m.status <> 'removed' AND m.username <> ${PSEUDO}
    ORDER BY message_count DESC`;
  return ok(rows, { count: rows.length });
}

const PutSchema = z.object({
  chat: z.string().default(FLIX_CHAT),
  member_username: z.string().min(1),
  avatar_url: z.string().nullable().optional(),
  tile_url: z.string().nullable().optional(),
  banner_url: z.string().nullable().optional(),
  banner_preset: z.string().nullable().optional(),
  tagline: z.string().max(200).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  pinned: z.boolean().optional(),
  hidden: z.boolean().optional(),
  banner_focus_x: z.number().optional(),
  banner_focus_y: z.number().optional(),
  banner_zoom: z.number().optional(),
  poster_focus_x: z.number().optional(),
  poster_focus_y: z.number().optional(),
  poster_zoom: z.number().optional(),
  card_url: z.string().nullable().optional(),
  hero_desktop_url: z.string().nullable().optional(),
  hero_mobile_url: z.string().nullable().optional(),
  card_fit: z.enum(['cover', 'contain']).optional(),
  hero_desktop_fit: z.enum(['cover', 'contain']).optional(),
  hero_mobile_fit: z.enum(['cover', 'contain']).optional(),
  hero_mobile_focus_x: z.number().optional(),
  hero_mobile_focus_y: z.number().optional(),
  hero_mobile_zoom: z.number().optional(),
});

/** Upsert one member's profile. Pinning one member unpins all others (a single
 *  billboard), done in the same transaction. */
export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const p = parsed.data;

  const imageReason = validateImageRef(p.avatar_url, 'avatar')
    ?? validateImageRef(p.tile_url, 'tile')
    ?? validateImageRef(p.banner_url, 'banner')
    ?? validateImageRef(p.card_url, 'poster')
    ?? validateImageRef(p.hero_desktop_url, 'banner')
    ?? validateImageRef(p.hero_mobile_url, 'banner');
  if (imageReason) return fail(400, 'bad_image', imageReason);

  const [member] = await sql`SELECT username FROM members WHERE username = ${p.member_username} AND chat_id = ${p.chat}`;
  if (!member) return fail(404, 'member_not_found', `no member '${p.member_username}' in ${p.chat}`);
  const [existing] = await sql`
    SELECT profile_source_username FROM member_profiles
    WHERE chat_id = ${p.chat} AND member_username = ${p.member_username}`;
  if (existing?.profile_source_username) {
    return fail(409, 'profile_linked', `unlink '${p.member_username}' from its source show before editing it`);
  }

  const frame = clampFrame({
    x: p.banner_focus_x ?? DEFAULT_FRAME.x,
    y: p.banner_focus_y ?? DEFAULT_FRAME.y,
    zoom: p.banner_zoom ?? DEFAULT_FRAME.zoom,
  });
  const poster = clampFrame({
    x: p.poster_focus_x ?? DEFAULT_FRAME.x,
    y: p.poster_focus_y ?? DEFAULT_FRAME.y,
    zoom: p.poster_zoom ?? DEFAULT_FRAME.zoom,
  });
  const heroMobile = clampFrame({
    x: p.hero_mobile_focus_x ?? DEFAULT_FRAME.x,
    y: p.hero_mobile_focus_y ?? DEFAULT_FRAME.y,
    zoom: p.hero_mobile_zoom ?? DEFAULT_FRAME.zoom,
  });

  await sql.begin(async tx => {
    if (p.pinned) {
      await tx`UPDATE member_profiles SET pinned = FALSE, updated_at = now()
               WHERE chat_id = ${p.chat} AND pinned = TRUE AND member_username <> ${p.member_username}`;
    }
    await tx`
      INSERT INTO member_profiles
        (chat_id, member_username, avatar_url, tile_url, banner_url, banner_preset, tagline, description, pinned, hidden,
         banner_focus_x, banner_focus_y, banner_zoom,
         poster_focus_x, poster_focus_y, poster_zoom,
         card_url, hero_desktop_url, hero_mobile_url,
         card_fit, hero_desktop_fit, hero_mobile_fit,
         hero_mobile_focus_x, hero_mobile_focus_y, hero_mobile_zoom, updated_at)
      VALUES (${p.chat}, ${p.member_username}, ${p.avatar_url ?? null}, ${p.tile_url ?? null}, ${p.banner_url ?? null},
              ${p.banner_preset ?? null}, ${p.tagline ?? null}, ${p.description ?? null},
              ${p.pinned ?? false}, ${p.hidden ?? false},
              ${frame.x}, ${frame.y}, ${frame.zoom},
              ${poster.x}, ${poster.y}, ${poster.zoom},
              ${p.card_url ?? null}, ${p.hero_desktop_url ?? null}, ${p.hero_mobile_url ?? null},
              ${p.card_fit ?? 'cover'}, ${p.hero_desktop_fit ?? 'cover'}, ${p.hero_mobile_fit ?? 'cover'},
              ${heroMobile.x}, ${heroMobile.y}, ${heroMobile.zoom}, now())
      ON CONFLICT (chat_id, member_username) DO UPDATE SET
        avatar_url = EXCLUDED.avatar_url,
        tile_url = EXCLUDED.tile_url,
        banner_url = EXCLUDED.banner_url,
        banner_preset = EXCLUDED.banner_preset,
        tagline = EXCLUDED.tagline,
        description = EXCLUDED.description,
        pinned = EXCLUDED.pinned,
        hidden = EXCLUDED.hidden,
        banner_focus_x = EXCLUDED.banner_focus_x,
        banner_focus_y = EXCLUDED.banner_focus_y,
        banner_zoom = EXCLUDED.banner_zoom,
        poster_focus_x = EXCLUDED.poster_focus_x,
        poster_focus_y = EXCLUDED.poster_focus_y,
        poster_zoom = EXCLUDED.poster_zoom,
        card_url = EXCLUDED.card_url,
        hero_desktop_url = EXCLUDED.hero_desktop_url,
        hero_mobile_url = EXCLUDED.hero_mobile_url,
        card_fit = EXCLUDED.card_fit,
        hero_desktop_fit = EXCLUDED.hero_desktop_fit,
        hero_mobile_fit = EXCLUDED.hero_mobile_fit,
        hero_mobile_focus_x = EXCLUDED.hero_mobile_focus_x,
        hero_mobile_focus_y = EXCLUDED.hero_mobile_focus_y,
        hero_mobile_zoom = EXCLUDED.hero_mobile_zoom,
        updated_at = now()`;
  });
  return ok({ saved: p.member_username });
}

const PostSchema = z.object({
  chat: z.string().default(FLIX_CHAT),
  source_username: z.string().min(1).nullable(),
  target_usernames: z.array(z.string().min(1)).min(1).max(25),
});

/** Link one or more alt accounts to a configured source show. This updates a
 * tiny pointer only: no image bytes, messages, analytics, or cache refreshes.
 * A null source unlinks the targets and restores their own saved setup. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const { chat, source_username: source, target_usernames: targets } = parsed.data;

  const invalid = validateProfileLinkInput(source, targets);
  if (invalid) return fail(400, 'bad_request', invalid);

  const targetRows = await sql`
    SELECT username FROM members
    WHERE chat_id = ${chat} AND username = ANY(${targets}) AND status <> 'removed'`;
  const foundTargets = new Set(targetRows.map(row => row.username as string));
  const missingTargets = targets.filter(target => !foundTargets.has(target));
  if (missingTargets.length > 0) {
    return fail(404, 'member_not_found', `target member(s) not found or removed: ${missingTargets.join(', ')}`);
  }

  let parts: string[] = [];
  if (source) {
    const [sourceRow] = await sql`
      SELECT p.*, m.status
      FROM member_profiles p
      JOIN members m ON m.chat_id = p.chat_id AND m.username = p.member_username
      WHERE p.chat_id = ${chat} AND p.member_username = ${source}`;
    if (!sourceRow || sourceRow.status === 'removed') {
      return fail(404, 'profile_source_not_found', `source show '${source}' is not configured or is removed`);
    }
    if (sourceRow.profile_source_username) {
      return fail(409, 'profile_source_linked', `use the original source '${sourceRow.profile_source_username}' instead of a linked alt`);
    }
    parts = profileSetupParts(sourceRow);
    if (parts.length === 0) {
      return fail(409, 'profile_source_empty', `source show '${source}' has no curated setup to share`);
    }

    // Keep inheritance one level deep. A profile already serving as a source
    // cannot itself become an alt until its dependants are relinked/unlinked.
    const referenced = await sql`
      SELECT DISTINCT profile_source_username
      FROM member_profiles
      WHERE chat_id = ${chat} AND profile_source_username = ANY(${targets})`;
    if (referenced.length > 0) {
      return fail(409, 'profile_link_chain', `target '${referenced[0]!.profile_source_username}' already supplies another show's setup`);
    }
  }

  if (source) {
    const rows = targets.map(member_username => ({
      chat_id: chat,
      member_username,
      profile_source_username: source,
    }));
    await sql`
      INSERT INTO member_profiles ${sql(rows, 'chat_id', 'member_username', 'profile_source_username')}
      ON CONFLICT (chat_id, member_username) DO UPDATE SET
        profile_source_username = EXCLUDED.profile_source_username,
        updated_at = now()`;
  } else {
    await sql`
      UPDATE member_profiles SET profile_source_username = NULL, updated_at = now()
      WHERE chat_id = ${chat} AND member_username = ANY(${targets})`;
  }

  return ok({
    source,
    targets,
    setup: parts,
    linked: source ? targets.length : 0,
    unlinked: source ? 0 : targets.length,
  });
}
