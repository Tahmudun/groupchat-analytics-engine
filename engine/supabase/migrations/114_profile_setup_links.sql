-- 114: lightweight show-setup inheritance for alternate accounts.
--
-- Uploaded artwork is stored as inline data URIs, so copying a configured
-- profile into several alts would duplicate large blobs. Instead an alt can
-- point at one direct source profile. The resolved view exposes the source's
-- visual/text setup while preserving the alt's own pinned/hidden flags.

ALTER TABLE member_profiles
  ADD COLUMN profile_source_username TEXT;

ALTER TABLE member_profiles
  ADD CONSTRAINT member_profiles_profile_source_not_self
  CHECK (profile_source_username IS NULL OR profile_source_username <> member_username);

CREATE INDEX idx_member_profiles_profile_source
  ON member_profiles (chat_id, profile_source_username)
  WHERE profile_source_username IS NOT NULL;

CREATE VIEW resolved_member_profiles
WITH (security_invoker = true)
AS
SELECT
  p.chat_id,
  p.member_username,
  CASE WHEN src.member_username IS NULL THEN p.avatar_url ELSE src.avatar_url END AS avatar_url,
  CASE WHEN src.member_username IS NULL THEN p.banner_url ELSE src.banner_url END AS banner_url,
  CASE WHEN src.member_username IS NULL THEN p.banner_preset ELSE src.banner_preset END AS banner_preset,
  CASE WHEN src.member_username IS NULL THEN p.tagline ELSE src.tagline END AS tagline,
  CASE WHEN src.member_username IS NULL THEN p.description ELSE src.description END AS description,
  p.pinned,
  p.hidden,
  GREATEST(p.updated_at, COALESCE(src.updated_at, p.updated_at)) AS updated_at,
  CASE WHEN src.member_username IS NULL THEN p.tile_url ELSE src.tile_url END AS tile_url,
  CASE WHEN src.member_username IS NULL THEN p.banner_focus_x ELSE src.banner_focus_x END AS banner_focus_x,
  CASE WHEN src.member_username IS NULL THEN p.banner_focus_y ELSE src.banner_focus_y END AS banner_focus_y,
  CASE WHEN src.member_username IS NULL THEN p.banner_zoom ELSE src.banner_zoom END AS banner_zoom,
  CASE WHEN src.member_username IS NULL THEN p.poster_focus_x ELSE src.poster_focus_x END AS poster_focus_x,
  CASE WHEN src.member_username IS NULL THEN p.poster_focus_y ELSE src.poster_focus_y END AS poster_focus_y,
  CASE WHEN src.member_username IS NULL THEN p.poster_zoom ELSE src.poster_zoom END AS poster_zoom,
  CASE WHEN src.member_username IS NULL THEN p.card_url ELSE src.card_url END AS card_url,
  CASE WHEN src.member_username IS NULL THEN p.hero_desktop_url ELSE src.hero_desktop_url END AS hero_desktop_url,
  CASE WHEN src.member_username IS NULL THEN p.hero_mobile_url ELSE src.hero_mobile_url END AS hero_mobile_url,
  CASE WHEN src.member_username IS NULL THEN p.card_fit ELSE src.card_fit END AS card_fit,
  CASE WHEN src.member_username IS NULL THEN p.hero_desktop_fit ELSE src.hero_desktop_fit END AS hero_desktop_fit,
  CASE WHEN src.member_username IS NULL THEN p.hero_mobile_fit ELSE src.hero_mobile_fit END AS hero_mobile_fit,
  CASE WHEN src.member_username IS NULL THEN p.hero_mobile_focus_x ELSE src.hero_mobile_focus_x END AS hero_mobile_focus_x,
  CASE WHEN src.member_username IS NULL THEN p.hero_mobile_focus_y ELSE src.hero_mobile_focus_y END AS hero_mobile_focus_y,
  CASE WHEN src.member_username IS NULL THEN p.hero_mobile_zoom ELSE src.hero_mobile_zoom END AS hero_mobile_zoom,
  p.profile_source_username
FROM member_profiles p
LEFT JOIN member_profiles src
  ON src.chat_id = p.chat_id
 AND src.member_username = p.profile_source_username;
