-- 107: profile tile art. The Netflix-style rounded-square image shown for a
-- member on the login "Who's watching?" grid (top 8 most active this week).
-- Distinct from avatar_url (the small circular pfp shown beside their name)
-- and banner_url (show-page banner / home-row poster). Stored as an inline
-- data: URI like the other member_profiles images (session-14 convention).

ALTER TABLE member_profiles ADD COLUMN tile_url TEXT;
