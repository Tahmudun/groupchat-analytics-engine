-- 104: Fuzzy-typo support. Full-text (search_vector GIN) already exists from
-- the search-engine era; this adds trigram similarity for typo tolerance.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
    ON messages USING GIN (content gin_trgm_ops);
