-- Onboarding tour state: tracks whether a user has completed or skipped each
-- versioned guided tour.
-- Apply via Supabase Dashboard → SQL Editor.
--
-- Implementation note: the live app (v1 beta) stores tour state in
-- auth.users.user_metadata (tour_state JSON key) via supabase.auth.updateUser().
-- This table is the long-term canonical store; migrate to it when user_metadata
-- becomes a bottleneck or when server-side reads are needed.

CREATE TABLE IF NOT EXISTS public.user_onboarding_state (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_version    text        NOT NULL,
  completed_at    timestamptz NULL,
  skipped_at      timestamptz NULL,
  last_seen_step  integer     NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tour_version)
);

CREATE INDEX IF NOT EXISTS user_onboarding_state_user_idx
  ON public.user_onboarding_state(user_id);

ALTER TABLE public.user_onboarding_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_tour_state" ON public.user_onboarding_state;
CREATE POLICY "users_read_own_tour_state" ON public.user_onboarding_state
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_upsert_own_tour_state" ON public.user_onboarding_state;
CREATE POLICY "users_upsert_own_tour_state" ON public.user_onboarding_state
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_tour_state" ON public.user_onboarding_state;
CREATE POLICY "users_update_own_tour_state" ON public.user_onboarding_state
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS user_onboarding_state_updated_at ON public.user_onboarding_state;
CREATE TRIGGER user_onboarding_state_updated_at
  BEFORE UPDATE ON public.user_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─── MANUAL QA CHECKLIST ────────────────────────────────────────────────────
-- After applying:
--   SELECT * FROM public.user_onboarding_state LIMIT 0;   -- should return 0 rows
--   INSERT INTO public.user_onboarding_state (user_id, tour_version, completed_at)
--     VALUES (auth.uid(), 'campusos-first-login-tour-v1', now());
--   SELECT * FROM public.user_onboarding_state;           -- should return 1 row
--   -- Try from a second auth session — should see only own rows.
