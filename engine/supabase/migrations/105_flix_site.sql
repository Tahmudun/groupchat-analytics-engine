-- 105: FLIX site tables. member_profiles = admin-curated show metadata per
-- member (billboard/banner/avatar). custom_categories(+entries) = manually
-- curated home-page rows. login_attempts = shared rate-limit state for the
-- site/admin password gates (serverless instances share it via the DB).

CREATE TABLE member_profiles (
    chat_id         TEXT NOT NULL REFERENCES chats(id),
    member_username TEXT NOT NULL,
    avatar_url      TEXT,          -- storage path, served via /api/media/
    banner_url      TEXT,          -- storage path
    banner_preset   TEXT,          -- keyart preset id (used when banner_url null)
    tagline         TEXT,
    description     TEXT,
    pinned          BOOLEAN NOT NULL DEFAULT FALSE,  -- pin to home billboard
    hidden          BOOLEAN NOT NULL DEFAULT FALSE,  -- hide from home rows
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chat_id, member_username)
);
ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE custom_categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id    TEXT NOT NULL REFERENCES chats(id),
    title      TEXT NOT NULL,
    position   INT  NOT NULL DEFAULT 0,   -- sort order among custom rows
    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_custom_categories_chat ON custom_categories (chat_id, position);
ALTER TABLE custom_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE custom_category_entries (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id     BIGINT NOT NULL REFERENCES custom_categories(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,        -- "show name"
    subtitle        TEXT,
    poster_url      TEXT,                 -- storage path (uploaded poster/banner)
    poster_preset   TEXT,                 -- keyart preset id fallback
    member_username TEXT,                 -- optional: links card to a show page
    position        INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_custom_entries_cat ON custom_category_entries (category_id, position);
ALTER TABLE custom_category_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE login_attempts (
    key           TEXT PRIMARY KEY,       -- 'ip:<addr>' or 'global'
    fail_count    INT NOT NULL DEFAULT 0,
    first_fail_at TIMESTAMPTZ,
    locked_until  TIMESTAMPTZ
);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
