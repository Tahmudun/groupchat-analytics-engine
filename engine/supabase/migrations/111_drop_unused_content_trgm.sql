-- 111: Drop the unused trigram index on messages.content (66 MB, zero scans
-- since creation in 104 — no query path uses trigram matching on content;
-- engine search is pure full-text via search_vector, and merge suggestions
-- run similarity() on the tiny members table). Reclaims DB-size quota on the
-- free tier. The pg_trgm EXTENSION stays — mergeSuggestions needs similarity().
DROP INDEX IF EXISTS idx_messages_content_trgm;
