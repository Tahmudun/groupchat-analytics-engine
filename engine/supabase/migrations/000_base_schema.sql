-- 000: Base schema. Creates the tables the legacy Python ingester owned, so
-- the engine can bootstrap a database from zero (demo DB, self-hosting).
--
-- Sorts before 100 and is fully idempotent: the restored production database
-- already has these objects and does NOT list this file in engine_migrations,
-- so `wrapped migrate` will run it there exactly once as a no-op.
--
-- Deliberately excludes everything Supabase-specific from the legacy file:
-- no GRANT ... TO anon, no PostgREST RPCs, no RLS policies.

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT        PRIMARY KEY,
    sender          TEXT        NOT NULL,
    timestamp_ms    BIGINT      NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    content         TEXT        NOT NULL DEFAULT '',
    media_type      TEXT        NULL,
    message_type    TEXT        NOT NULL DEFAULT 'message',
    search_vector   TSVECTOR    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
        setweight(to_tsvector('simple',  coalesce(sender,  '')), 'B')
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_messages_sender        ON messages (sender);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp     ON messages ("timestamp");
CREATE INDEX IF NOT EXISTS idx_messages_media_type    ON messages (media_type) WHERE media_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_message_type  ON messages (message_type);
CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON messages USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS reactions (
    message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reactor     TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    PRIMARY KEY (message_id, reactor, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_reactor    ON reactions (reactor);
CREATE INDEX IF NOT EXISTS idx_reactions_emoji      ON reactions (emoji);
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions (message_id);

CREATE TABLE IF NOT EXISTS members (
    username    TEXT        PRIMARY KEY,
    alias       TEXT        NULL,
    bio_name    TEXT        NULL,
    aliases     TEXT[]      NOT NULL DEFAULT '{}',
    status      TEXT        NOT NULL DEFAULT 'unrecognized'
                CHECK (status IN ('recognized', 'unrecognized', 'deleted', 'removed')),
    notes       TEXT        NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_status  ON members (status);
CREATE INDEX IF NOT EXISTS idx_members_aliases ON members USING GIN (aliases);

CREATE TABLE IF NOT EXISTS site_stats (
    singleton_id     BOOLEAN     PRIMARY KEY DEFAULT TRUE,
    CONSTRAINT       only_one_row CHECK (singleton_id = TRUE),
    total_messages   BIGINT      NOT NULL DEFAULT 0,
    total_reactions  BIGINT      NOT NULL DEFAULT 0,
    member_count     BIGINT      NOT NULL DEFAULT 0,
    date_range_start TIMESTAMPTZ,
    date_range_end   TIMESTAMPTZ,
    last_ingested_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO site_stats (singleton_id) VALUES (TRUE)
ON CONFLICT (singleton_id) DO NOTHING;

CREATE MATERIALIZED VIEW IF NOT EXISTS sender_message_counts AS
  SELECT sender, COUNT(*)::BIGINT AS msg_count
  FROM messages
  WHERE message_type = 'message'
  GROUP BY sender;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sender_message_counts_sender
  ON sender_message_counts (sender);

CREATE MATERIALIZED VIEW IF NOT EXISTS message_reaction_counts AS
  SELECT r.message_id,
         COUNT(*)::BIGINT AS rxn_count,
         m.sender,
         m."timestamp",
         m.media_type
  FROM reactions r
  JOIN messages m ON m.id = r.message_id
  WHERE m.message_type = 'message'
  GROUP BY r.message_id, m.sender, m."timestamp", m.media_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reaction_counts_id
  ON message_reaction_counts (message_id);

CREATE INDEX IF NOT EXISTS idx_message_reaction_counts_count
  ON message_reaction_counts (rxn_count DESC)
  INCLUDE (message_id, sender, "timestamp", media_type);
