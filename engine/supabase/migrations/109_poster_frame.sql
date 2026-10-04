-- 109: independent poster crop. Migration 108's single frame drove both the
-- wide banner (2:1) and the tall poster card (2:3), so fixing one crop
-- disturbed the other. These give the poster its own focal point + zoom;
-- banner_* keeps driving the billboard and show-page header. Defaults are the
-- untouched center crop, so existing rows render exactly as before.

ALTER TABLE member_profiles ADD COLUMN poster_focus_x REAL NOT NULL DEFAULT 50;
ALTER TABLE member_profiles ADD COLUMN poster_focus_y REAL NOT NULL DEFAULT 50;
ALTER TABLE member_profiles ADD COLUMN poster_zoom    REAL NOT NULL DEFAULT 1;
