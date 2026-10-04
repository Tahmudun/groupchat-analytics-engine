-- 101: Alias resolution table. members.username stays the identity anchor
-- (global PK — see plan Design Decision 3); this table holds every string
-- that refers to that member. Seeded from the columns the search engine
-- already curated: username (handle), bio_name (real_name), alias +
-- aliases[] (nicknames).

CREATE TABLE member_aliases (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id         TEXT NOT NULL REFERENCES chats(id),
    member_username TEXT NOT NULL REFERENCES members(username),
    alias           TEXT NOT NULL,
    alias_type      TEXT NOT NULL CHECK (alias_type IN ('handle', 'real_name', 'nickname', 'roast')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chat_id, member_username, alias)
);

CREATE INDEX idx_member_aliases_chat_lower ON member_aliases (chat_id, lower(alias));
ALTER TABLE member_aliases ENABLE ROW LEVEL SECURITY;

INSERT INTO member_aliases (chat_id, member_username, alias, alias_type)
SELECT chat_id, username, username, 'handle' FROM members
ON CONFLICT DO NOTHING;

INSERT INTO member_aliases (chat_id, member_username, alias, alias_type)
SELECT chat_id, username, bio_name, 'real_name' FROM members
WHERE bio_name IS NOT NULL AND bio_name <> username
ON CONFLICT DO NOTHING;

INSERT INTO member_aliases (chat_id, member_username, alias, alias_type)
SELECT chat_id, username, alias, 'nickname' FROM members
WHERE alias IS NOT NULL AND alias <> username
ON CONFLICT DO NOTHING;

INSERT INTO member_aliases (chat_id, member_username, alias, alias_type)
SELECT m.chat_id, m.username, a.nick, 'nickname'
FROM members m, unnest(m.aliases) AS a(nick)
WHERE a.nick <> m.username
ON CONFLICT DO NOTHING;
