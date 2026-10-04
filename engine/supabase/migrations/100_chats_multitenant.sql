-- 100: Multi-tenant foundation.
-- Additive only: creates chats, adds chat_id to messages/members with a
-- DEFAULT so (a) the existing rows backfill instantly via the fast
-- default path (no table rewrite), and (b) the legacy Python ingester —
-- which doesn't know about chat_id — keeps working correctly.

CREATE TABLE chats (
    id            TEXT PRIMARY KEY,                 -- the slug ('flix-original')
    name          TEXT NOT NULL,
    platform      TEXT NOT NULL DEFAULT 'instagram'
                  CHECK (platform IN ('instagram', 'whatsapp', 'discord', 'messenger')),
    owner_user_id UUID NULL,                        -- future Supabase Auth user
    is_synthetic  BOOLEAN NOT NULL DEFAULT FALSE,
    is_public     BOOLEAN NOT NULL DEFAULT FALSE,
    config_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO chats (id, name, platform)
VALUES ('flix-original', 'Flix', 'instagram');

-- IF NOT EXISTS + a separately named FK (2026-10-01): a fresh database built
-- from search-engine/supabase/schema.sql already has chat_id (that file
-- mirrors this migration without the FK). Constraint names match what the
-- original inline REFERENCES produced on the live DB.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS chat_id TEXT NOT NULL DEFAULT 'flix-original';
ALTER TABLE messages
    ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats(id);
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS chat_id TEXT NOT NULL DEFAULT 'flix-original';
ALTER TABLE members
    ADD CONSTRAINT members_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats(id);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_members_chat_id  ON members  (chat_id);

-- Deny-by-default for the anon key: RLS on, no policies.
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
