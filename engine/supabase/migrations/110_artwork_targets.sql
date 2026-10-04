-- 110: independent artwork targets. One show-art image + two crops (108/109)
-- couldn't represent the three real surfaces — the 2:3 poster card, the
-- desktop hero (~2.32:1 at 1440×900), and the mobile hero (~0.63:1 at
-- 390×844, which previously reused the desktop crop). Each target now has an
-- optional image of its own (NULL → falls back to banner_url, so old records
-- keep working; mobile prefers the desktop hero image first), a fit mode
-- (cover = fill+crop, contain = whole image over a blurred backdrop), and —
-- for the mobile hero — its own focal point + zoom. Card crop keeps using
-- poster_focus_*/poster_zoom; desktop hero keeps banner_focus_*/banner_zoom.

ALTER TABLE member_profiles ADD COLUMN card_url         TEXT;
ALTER TABLE member_profiles ADD COLUMN hero_desktop_url TEXT;
ALTER TABLE member_profiles ADD COLUMN hero_mobile_url  TEXT;

ALTER TABLE member_profiles ADD COLUMN card_fit         TEXT NOT NULL DEFAULT 'cover' CHECK (card_fit IN ('cover', 'contain'));
ALTER TABLE member_profiles ADD COLUMN hero_desktop_fit TEXT NOT NULL DEFAULT 'cover' CHECK (hero_desktop_fit IN ('cover', 'contain'));
ALTER TABLE member_profiles ADD COLUMN hero_mobile_fit  TEXT NOT NULL DEFAULT 'cover' CHECK (hero_mobile_fit IN ('cover', 'contain'));

ALTER TABLE member_profiles ADD COLUMN hero_mobile_focus_x REAL NOT NULL DEFAULT 50;
ALTER TABLE member_profiles ADD COLUMN hero_mobile_focus_y REAL NOT NULL DEFAULT 50;
ALTER TABLE member_profiles ADD COLUMN hero_mobile_zoom    REAL NOT NULL DEFAULT 1;
