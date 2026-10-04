-- 108: show-art framing. cover-fit crops the banner in both its render boxes
-- (desktop billboard ~2:1, poster card 2:3 / phone billboard), often cutting
-- off the subject. These store an admin-chosen focal point (percent) + zoom,
-- edited with the Shows editor frame tool and applied via object-position /
-- transform on the site (lib/flix/frame.ts).

ALTER TABLE member_profiles ADD COLUMN banner_focus_x REAL NOT NULL DEFAULT 50;
ALTER TABLE member_profiles ADD COLUMN banner_focus_y REAL NOT NULL DEFAULT 50;
ALTER TABLE member_profiles ADD COLUMN banner_zoom    REAL NOT NULL DEFAULT 1;
