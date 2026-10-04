-- 115: Close the legacy public (anon) data path — the v0 search engine is retired.
--
-- The vanilla search-engine/ frontend shipped the Supabase publishable key to
-- browsers and read the chat through PostgREST as the `anon` role. Its RLS
-- policies granted anon SELECT on every message/reaction/member row and UPDATE
-- on members, so anyone holding that key could page through the whole chat.
-- Three legacy RPCs (search_messages, get_members_with_counts, update_member)
-- are SECURITY DEFINER, so they bypass RLS entirely — dropping the policies
-- alone would not close them. Postgres also grants EXECUTE to PUBLIC on every
-- new function by default, which anon inherits.
--
-- The FLIX site and every pipeline connect directly as the database owner,
-- never through PostgREST, so nothing in engine/ depends on these grants.
--
-- Portable: anon/authenticated only exist on Supabase. On plain Postgres
-- (local, Neon, a VPS) the role blocks are skipped and the rest still applies.

DROP POLICY IF EXISTS "anon can read messages"   ON messages;
DROP POLICY IF EXISTS "anon can read reactions"  ON reactions;
DROP POLICY IF EXISTS "anon can read members"    ON members;
DROP POLICY IF EXISTS "anon can update members"  ON members;
DROP POLICY IF EXISTS "anon can read site_stats" ON site_stats;

DO $$
DECLARE
  fn regprocedure;
  r  text;
BEGIN
  -- Every overload of the legacy RPCs, whatever its signature drifted to.
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('search_messages', 'count_messages', 'get_distinct_senders',
                        'get_members_with_counts', 'update_member',
                        'find_interactions', 'activity_around')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      -- Tables, views (resolved_member_profiles runs with owner rights) and
      -- materialized views (no RLS possible) — all of them, not a list.
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      -- Supabase grants new objects to anon by default; stop that for
      -- everything future migrations create.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
