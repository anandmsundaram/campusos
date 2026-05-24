-- Terms acceptance table: tracks which users have accepted which version of the terms.
-- Apply via Supabase Dashboard → SQL Editor.
--
-- Implementation note: the live app (v1 beta) stores acceptance in auth.users.user_metadata
-- via the get_my_gate_status() helper and supabase.auth.updateUser().  This table is the
-- long-term canonical store; migrate to it when auth.users metadata becomes a bottleneck.

CREATE TABLE IF NOT EXISTS public.user_terms_acceptances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version     text        NOT NULL,
  privacy_version   text        NOT NULL,
  guidelines_version text       NOT NULL,
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  accepted_from     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, terms_version, privacy_version, guidelines_version)
);

CREATE INDEX IF NOT EXISTS user_terms_acceptances_user_idx
  ON public.user_terms_acceptances(user_id);

ALTER TABLE public.user_terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_acceptance" ON public.user_terms_acceptances;
CREATE POLICY "users_read_own_acceptance" ON public.user_terms_acceptances
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_acceptance" ON public.user_terms_acceptances;
CREATE POLICY "users_insert_own_acceptance" ON public.user_terms_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- ─── MANUAL QA CHECKLIST ────────────────────────────────────────────────────
-- After applying:
--   SELECT * FROM public.user_terms_acceptances LIMIT 0;   -- should return 0 rows
--   INSERT INTO public.user_terms_acceptances (user_id, terms_version, privacy_version, guidelines_version)
--     VALUES (auth.uid(), '2026-05-terms-v1', '2026-05-privacy-v1', '2026-05-guidelines-v1');
--   -- Then retry from a second auth session — should fail with unique violation.
