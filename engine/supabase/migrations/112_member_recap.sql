-- 112: member_recap — precomputed "Recap" (Spotify-Wrapped-style) stats.
-- One JSONB blob per member, upserted by the recap compute stage
-- (lib/recap/compute.ts). Plain table, not a matview: catchphrase/persona
-- logic lives in TypeScript. stats_version gates what the API will serve.
CREATE TABLE IF NOT EXISTS member_recap (
    chat_id          TEXT NOT NULL REFERENCES chats(id),
    member_username  TEXT NOT NULL,
    stats            JSONB NOT NULL,
    stats_version    INT NOT NULL,
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chat_id, member_username)
);

ALTER TABLE member_recap ENABLE ROW LEVEL SECURITY;
