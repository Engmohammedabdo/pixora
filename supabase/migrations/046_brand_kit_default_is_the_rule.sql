-- 046_brand_kit_default_is_the_rule.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `is_default` has never once meant "default". Make it mean it.
--
-- See docs/adr/0002-is-default-is-the-rule-not-a-badge.md for the decision.
--
-- MEASURED ON THE LIVE DATABASE, 2026-09-01, before this file was written:
--
--     brand_kits rows            2
--     distinct owners            2
--     rows with is_default TRUE  0     <-- the whole problem
--     rows with is_default NULL  0
--     projects rows              0
--
-- Nothing in the product sets the flag on create. `components/brand-kit/
-- BrandKitForm.tsx:103-115` submits thirteen columns and this is not one;
-- `app/api/brand-kits/route.ts:69-72` inserts `{ user_id, ...input }` with no
-- promotion; and the 002:29 trigger only ever CLEARS the flag on other rows
-- (`IF NEW.is_default = true`), it never sets one. So both resolvers fall
-- through to their tiebreaker, and the tiebreaker is `created_at DESC`.
--
-- "The default kit" has therefore always meant "the NEWEST kit". A customer who
-- creates a second kit for a one-off client silently moves the identity of ALL
-- their work onto it, in every studio, with nothing on screen saying so. The
-- paid plans sell 3 and 10 kits.
--
-- The nullability is a second, independent defect. Postgres orders a boolean
-- DESC as NULLS FIRST, and supabase-js emits no nulls directive when
-- `nullsFirst` is undefined (postgrest-js PostgrestTransformBuilder.ts:339-341),
-- so `app/api/studios/edit/route.ts`'s ladder ranks a NULL row ABOVE a genuinely
-- TRUE one, while `hooks/useBrandKit.ts:98`'s `find(kit => kit.is_default)`
-- skips the NULL and lands on the TRUE one. Same customer, same rows, two
-- identities — which a comment in that route asserted was impossible until it
-- was corrected alongside this migration.
--
-- WHY THE TRIGGER AND NOT THE ROUTE. `app/api/brand-kits/route.ts` is not the
-- only writer: `brand_kits` RLS is a single `FOR ALL USING (auth.uid() =
-- user_id)` policy (002:19-23) and migration 044 left `authenticated` holding
-- INSERT on the table, so a customer can create a kit straight over PostgREST
-- and never meet the route's Zod schema. This repo already records that rule
-- twice (042's header, 044's header). A promotion that lives in the route holds
-- for the form and for nothing else.
--
-- WHICH KIT GETS PROMOTED IN THE BACKFILL, and why it is the OLDEST. Going
-- forward the rule is "your first kit is your default", so the backfill states
-- the same rule about the past. For any owner holding exactly one kit — which is
-- every owner on the live database today — oldest and newest are the same row
-- and the choice is unobservable. §0 reports how many owners it is NOT
-- unobservable for; if that number is greater than zero at apply time, read it
-- before committing, because for those owners this migration MOVES the identity
-- from the newest kit to the oldest one.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TEMP TABLE probe_results (probe text, verdict text) ON COMMIT DROP;
-- §6's probes run as `authenticated`, which is the whole point — so that role has
-- to be able to record its own verdicts. Without this the first probe dies on
-- 42501 inside its own EXCEPTION handler, and the migration reports nothing about
-- the rule it exists to prove. 044:81 and 045:107 state the same line.
GRANT INSERT, SELECT ON probe_results TO authenticated;

-- ── §0. Pre-flight, recorded rather than assumed ────────────────────────────
-- Informational rows (prefixed 'OK') so they survive the §7 gate but still land
-- in the final SELECT. apply.js discards NOTICE/WARNING, so a RAISE NOTICE here
-- would be invisible.
DO $preflight$
DECLARE
  v_rows      int;
  v_owners    int;
  v_true      int;
  v_null      int;
  v_ambiguous int;
BEGIN
  SELECT count(*), count(DISTINCT user_id),
         count(*) FILTER (WHERE is_default IS TRUE),
         count(*) FILTER (WHERE is_default IS NULL)
    INTO v_rows, v_owners, v_true, v_null
    FROM public.brand_kits;

  -- Owners for whom "oldest" and "newest" are different rows AND who hold no
  -- default today: the only owners whose identity this migration can move.
  SELECT count(*) INTO v_ambiguous FROM (
    SELECT user_id
      FROM public.brand_kits
     GROUP BY user_id
    HAVING count(*) > 1
       AND count(*) FILTER (WHERE is_default IS TRUE) = 0
  ) s;

  INSERT INTO probe_results VALUES
    ('0a rows / owners',            'OK ' || v_rows || ' rows, ' || v_owners || ' owners'),
    ('0b defaults before backfill', 'OK ' || v_true || ' true, ' || v_null || ' null'),
    ('0c owners whose identity MOVES',
       CASE WHEN v_ambiguous = 0
            THEN 'OK 0 — oldest and newest are the same row for every owner'
            ELSE 'OK ' || v_ambiguous || ' — REVIEW: these owners switch from their newest kit to their oldest' END);
END
$preflight$;

-- ── §1. No NULLs. Stated before the NOT NULL so the ALTER cannot fail. ──────
UPDATE public.brand_kits SET is_default = false WHERE is_default IS NULL;

-- ── §2. Every owner gets exactly one default ────────────────────────────────
-- Two statements, in this order, because the unique index in §4 must find a
-- table that already satisfies it.
--
-- 2a: an owner holding MORE THAN ONE default keeps only their oldest. Reachable
--     today: the 002 trigger's guard is `IF NEW.is_default = true`, which a NULL
--     walks straight through, so a NULL-then-true pair could leave two set. It is
--     also defeated by concurrency by construction.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
    FROM public.brand_kits
   WHERE is_default IS TRUE
)
UPDATE public.brand_kits k
   SET is_default = false
  FROM ranked r
 WHERE k.id = r.id AND r.rn > 1;

-- 2b: an owner holding NO default gets their oldest kit promoted. `ORDER BY
--     created_at, id` — `id` breaks a tie, because `created_at` is a timestamp
--     two rows can share and a backfill that is not deterministic is a backfill
--     that cannot be re-run to the same answer.
WITH first_kit AS (
  SELECT DISTINCT ON (user_id) id
    FROM public.brand_kits
   ORDER BY user_id, created_at, id
)
UPDATE public.brand_kits k
   SET is_default = true
  FROM first_kit f
 WHERE k.id = f.id
   AND NOT EXISTS (
     SELECT 1 FROM public.brand_kits o
      WHERE o.user_id = k.user_id AND o.is_default IS TRUE
   );

-- ── §3. The column stops lying to TypeScript ────────────────────────────────
-- `lib/supabase/types.ts:99` declares this `boolean`, not `boolean | null`. The
-- database has permitted NULL since 002:14, so every consumer has been reading a
-- type assertion the data could violate.
ALTER TABLE public.brand_kits
  ALTER COLUMN is_default SET DEFAULT false,
  ALTER COLUMN is_default SET NOT NULL;

-- ── §4. One default per owner, enforced by the database ─────────────────────
-- A partial unique index rather than a CHECK: the rule is across rows, not
-- within one. Not CONCURRENTLY — that cannot run inside a transaction, and this
-- migration must be rehearsable with a trailing ROLLBACK.
CREATE UNIQUE INDEX IF NOT EXISTS brand_kits_one_default_per_user
  ON public.brand_kits (user_id)
  WHERE is_default;

-- ── §5. The trigger promotes a first kit, and is NULL-proof ─────────────────
-- Two changes to 002:17-31:
--   * `IF NEW.is_default` instead of `IF NEW.is_default = true`. Equivalent now
--     that §3 forbids NULL, and it stays correct if that ever changes: `NULL =
--     true` is NULL, which is not true, so the old form let a NULL row through
--     the guard and then sorted ABOVE the real default. Stating the condition on
--     the value itself is what 038's header calls a rule stated on NEW.
--   * a first kit is promoted on INSERT. This is the half that never existed,
--     and it is here rather than in the route because the route is not the only
--     writer (see the header).
CREATE OR REPLACE FUNCTION ensure_single_default_brand_kit()
RETURNS trigger AS $$
BEGIN
  -- A customer's first kit IS their identity; making them go and press a button
  -- to say so is how `is_default` came to have zero true rows in production.
  IF TG_OP = 'INSERT' AND NOT NEW.is_default THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.brand_kits
       WHERE user_id = NEW.user_id AND id <> NEW.id
    ) THEN
      NEW.is_default := true;
    END IF;
  END IF;

  -- Clear any other default BEFORE the row lands, so §4's unique index is never
  -- transiently violated. This nested UPDATE re-enters the trigger with
  -- NEW.is_default = false, where both branches above are skipped — no recursion.
  IF NEW.is_default THEN
    UPDATE public.brand_kits
       SET is_default = false
     WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Two customers inserting their genuine first kit at the same instant will both
-- see NOT EXISTS, both promote, and the second will be refused by §4 with 23505.
-- That is the correct failure: refusing one insert is recoverable, two defaults
-- is the state this migration exists to make impossible.

-- ── §6. Prove it as `authenticated`, the role the app actually executes as ──
-- Every studio route runs through createServerClient() — anon key plus the
-- user's cookie JWT — so `authenticated` is the role that meets these rules. A
-- probe blocked by RLS is treated as a FAILURE by §7, not as a pass: it
-- certifies nothing.
DO $probe$
DECLARE
  v_fresh uuid;   -- a user holding NO brand kits, for the promotion probes
  v_kit1  uuid;
  v_kit2  uuid;
BEGIN
  SELECT u.id INTO v_fresh
    FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.brand_kits k WHERE k.user_id = u.id)
   ORDER BY u.created_at
   LIMIT 1;

  IF v_fresh IS NULL THEN
    INSERT INTO probe_results VALUES ('setup', 'FAIL: no kit-less user to probe promotion as');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_fresh::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fresh, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- A: the first kit is promoted without anyone asking.
  BEGIN
    INSERT INTO public.brand_kits (user_id, name) VALUES (v_fresh, 'Probe Kit One')
    RETURNING id INTO v_kit1;
    INSERT INTO probe_results VALUES ('A first kit auto-promoted',
      CASE WHEN (SELECT is_default FROM public.brand_kits WHERE id = v_kit1)
           THEN 'OK true' ELSE 'FAIL: not promoted' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES ('A first kit auto-promoted', 'FAIL: ' || SQLSTATE || ' ' || SQLERRM);
  END;

  -- B: the SECOND kit is not. Creating a kit for a one-off client must not
  --    silently move the customer's identity onto it — the whole defect.
  BEGIN
    INSERT INTO public.brand_kits (user_id, name) VALUES (v_fresh, 'Probe Kit Two')
    RETURNING id INTO v_kit2;
    INSERT INTO probe_results VALUES ('B second kit not promoted',
      CASE WHEN (SELECT is_default FROM public.brand_kits WHERE id = v_kit2)
           THEN 'FAIL: identity moved to the new kit' ELSE 'OK false' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES ('B second kit not promoted', 'FAIL: ' || SQLSTATE || ' ' || SQLERRM);
  END;

  -- C: an explicit switch still works, and moves the flag rather than duplicating it.
  BEGIN
    UPDATE public.brand_kits SET is_default = true WHERE id = v_kit2;
    INSERT INTO probe_results VALUES ('C explicit switch moves the flag',
      CASE WHEN (SELECT count(*) FROM public.brand_kits
                  WHERE user_id = v_fresh AND is_default) = 1
            AND (SELECT is_default FROM public.brand_kits WHERE id = v_kit2)
           THEN 'OK exactly one, on the chosen kit'
           ELSE 'FAIL: ' || (SELECT count(*) FROM public.brand_kits
                              WHERE user_id = v_fresh AND is_default)::text || ' defaults' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES ('C explicit switch moves the flag', 'FAIL: ' || SQLSTATE || ' ' || SQLERRM);
  END;

  -- D: the case the per-row trigger cannot decide on its own, and therefore the
  --    only probe that exercises §4's index rather than §5's trigger.
  --
  --    One statement setting BOTH rows true. The trigger fires per row, and its
  --    nested "clear the others" UPDATE touches a row the outer statement is
  --    itself about to update.
  --
  --    MEASURED at rehearsal, 2026-09-01: Postgres refuses this with **27000**
  --    (`tuple to be updated was already modified by an operation triggered by
  --    the current command`) — not 23505, and not two defaults. Recorded here
  --    because it was not what this probe was written expecting, and because a
  --    future reader will otherwise assume the index is what stops it.
  --
  --    Three outcomes are accepted, and they are accepted because each one means
  --    the invariant HELD, not because widening the assertion made the probe
  --    pass: exactly one row true (the trigger serialised), 23505 (the index
  --    caught it), or 27000 (Postgres refused the statement and rolled it back).
  --    "Two defaults, committed" is the only failure — and it is exactly the
  --    state that existed before this migration.
  --
  --    Note what 27000 costs: a multi-row `SET is_default = true` now errors
  --    where it used to silently set every row. Verified there is no such caller
  --    — the only write in the product is `updateBrandKit(kit.id, {is_default:
  --    true})` at app/[locale]/(dashboard)/brand-kit/page.tsx:82, one row by id,
  --    which probe C covers. A hand-written multi-row update over PostgREST is
  --    the only way to reach it, and failing closed is the right answer there.
  BEGIN
    UPDATE public.brand_kits SET is_default = true WHERE user_id = v_fresh;
    INSERT INTO probe_results VALUES ('D never two defaults',
      CASE WHEN (SELECT count(*) FROM public.brand_kits
                  WHERE user_id = v_fresh AND is_default) = 1
           THEN 'OK exactly one'
           ELSE 'FAIL: ' || (SELECT count(*) FROM public.brand_kits
                              WHERE user_id = v_fresh AND is_default)::text
                || ' defaults survived one statement' END);
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO probe_results VALUES ('D never two defaults', 'OK 23505 refused by the index');
    WHEN triggered_data_change_violation THEN
      INSERT INTO probe_results VALUES ('D never two defaults', 'OK 27000 statement refused, nothing committed');
    WHEN OTHERS THEN
      INSERT INTO probe_results VALUES ('D never two defaults', 'FAIL: ' || SQLSTATE || ' ' || SQLERRM);
  END;

  -- E: NULL is gone. §3's NOT NULL must refuse it explicitly, not coerce it.
  BEGIN
    UPDATE public.brand_kits SET is_default = NULL WHERE id = v_kit1;
    INSERT INTO probe_results VALUES ('E NULL refused', 'FAIL: accepted');
  EXCEPTION
    WHEN not_null_violation   THEN INSERT INTO probe_results VALUES ('E NULL refused', 'OK 23502');
    WHEN insufficient_privilege THEN INSERT INTO probe_results VALUES ('E NULL refused', 'OK 42501');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('E NULL refused', 'FAIL: ' || SQLSTATE);
  END;

  DELETE FROM public.brand_kits WHERE user_id = v_fresh;
  EXECUTE 'RESET ROLE';
END
$probe$;

-- F: the whole table, after the backfill. Not a probe of new behaviour — a probe
--    of the DATA, which is what §4's index depends on and what §2 had to get right.
DO $wholetable$
DECLARE
  v_no_default int;
  v_multi      int;
  v_null       int;
BEGIN
  SELECT count(*) INTO v_no_default FROM (
    SELECT user_id FROM public.brand_kits
     GROUP BY user_id HAVING count(*) FILTER (WHERE is_default) = 0) s;
  SELECT count(*) INTO v_multi FROM (
    SELECT user_id FROM public.brand_kits
     GROUP BY user_id HAVING count(*) FILTER (WHERE is_default) > 1) s;
  SELECT count(*) INTO v_null FROM public.brand_kits WHERE is_default IS NULL;

  INSERT INTO probe_results VALUES
    ('F1 every owner has a default', CASE WHEN v_no_default = 0 THEN 'OK'
        ELSE 'FAIL: ' || v_no_default || ' owner(s) with none' END),
    ('F2 no owner has two',          CASE WHEN v_multi = 0 THEN 'OK'
        ELSE 'FAIL: ' || v_multi || ' owner(s) with more than one' END),
    ('F3 no NULLs remain',           CASE WHEN v_null = 0 THEN 'OK'
        ELSE 'FAIL: ' || v_null || ' NULL row(s)' END);
END
$wholetable$;

-- ── §7. Refuse to commit unless every probe reached its expected verdict ────
-- A probe that could not decide is a failure, not a pass. Migration 045 computed
-- this count and committed anyway; 044 is the shape being followed here.
DO $gate$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM probe_results WHERE verdict NOT LIKE 'OK%';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'brand_kits default probes failed: % probe(s) did not reach the expected verdict', v_bad;
  END IF;
END
$gate$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('046', 'brand_kits: is_default NOT NULL, one per owner, first kit promoted on insert')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT probe, verdict FROM probe_results ORDER BY probe;

COMMIT;
