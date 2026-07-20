-- ═══════════════════════════════════════════════════════════════════════════
-- BOOTSTRAP_EXEC_SQL.sql — paste ONCE into the Supabase SQL Editor
--
-- Creates the `exec_sql` RPC so migrations can be applied remotely over Kong.
-- Your port 5432 is closed to the internet (correct), so this is the only
-- remaining path for automated schema changes.
--
-- ⚠️ READ THIS BEFORE PASTING — this function is effectively ROOT on your database.
--
--   `SECURITY DEFINER` means it runs as the function's owner (postgres), and it
--   executes whatever SQL string it is handed. Anyone who can call it can do
--   anything: read every table, drop them, mint credits, disable RLS.
--
--   It is restricted to `service_role` below. That restriction is the ONLY thing
--   protecting it — so it is exactly as safe as your service_role key, and no safer.
--
--   Your service_role key is currently compromised (it was committed to a public
--   GitHub repository and pasted into chat more than once).
--
--   ➜ ROTATE YOUR KEYS FIRST. See docs/ROTATE_SECRETS.md.
--     Creating this function while the old key is still valid hands a
--     database-root primitive to whoever already has that key.
--
--   If you would rather not keep a permanent root primitive at all, that is a
--   perfectly reasonable choice: skip this file and paste the migrations
--   themselves into the SQL Editor instead. The only thing you lose is the
--   ability to automate future migrations.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.exec_sql(query TEXT)
RETURNS TEXT AS $$
BEGIN
  EXECUTE query;
  RETURN 'ok';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lock it to service_role. Without these two statements the function is callable
-- with the PUBLIC anon key that ships in every browser bundle — which would be a
-- complete, remote, unauthenticated database takeover.
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;

-- ── Verify the lock actually took ──────────────────────────────────────────
-- Both must be false. If either is true, STOP and do not use this function.
SELECT
  has_function_privilege('anon',          'public.exec_sql(text)', 'EXECUTE') AS anon_can_run,
  has_function_privilege('authenticated', 'public.exec_sql(text)', 'EXECUTE') AS authenticated_can_run;

-- ── When you are done with migrations ──────────────────────────────────────
-- Removing it costs nothing and shrinks your attack surface back down:
--
--   DROP FUNCTION IF EXISTS public.exec_sql(TEXT);
