-- QA bypass table: lets QA/test users skip first-login gates without code changes.
-- Apply via Supabase Dashboard → SQL Editor.
--
-- Implementation note: the live app (v1 beta) stores bypass flags in
-- auth.users.user_metadata (qa_bypass JSON key) via admin.auth.admin.updateUserById().
-- This table is the long-term canonical store.
--
-- To add a bypass user (once this migration is applied):
--
--   INSERT INTO public.qa_bypass_users (email, bypass_terms_acceptance, reason, environment, expires_at, is_active)
--   VALUES ('tester@example.com', true, 'QA tester bypass', 'local', now() + interval '30 days', true);
--
--   -- or by user_id:
--   INSERT INTO public.qa_bypass_users (user_id, bypass_terms_acceptance, reason, environment, expires_at, is_active)
--   VALUES ('<auth-user-uuid>', true, 'QA tester bypass', 'local', now() + interval '30 days', true);

CREATE TABLE IF NOT EXISTS public.qa_bypass_users (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid                    REFERENCES auth.users(id) ON DELETE CASCADE,
  email                    text,
  bypass_terms_acceptance  boolean     NOT NULL DEFAULT false,
  bypass_guided_tour       boolean     NOT NULL DEFAULT false,
  bypass_onboarding        boolean     NOT NULL DEFAULT false,
  reason                   text,
  environment              text        NOT NULL DEFAULT 'local',
  expires_at               timestamptz,
  is_active                boolean     NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid                    REFERENCES auth.users(id),
  CONSTRAINT qa_bypass_at_least_one_id CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS qa_bypass_users_user_idx  ON public.qa_bypass_users(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qa_bypass_users_email_idx ON public.qa_bypass_users(email)   WHERE email IS NOT NULL;

ALTER TABLE public.qa_bypass_users ENABLE ROW LEVEL SECURITY;

-- Normal users cannot read the bypass table directly.
-- All access goes through get_my_bypass_flags() RPC below.
-- (No SELECT policy means no authenticated reads except via SECURITY DEFINER RPC.)


-- ─── RPC: get_my_bypass_flags ────────────────────────────────────────────────
-- Returns only the current user's bypass flags.  Never leaks other users' data.

CREATE OR REPLACE FUNCTION public.get_my_bypass_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id  uuid  := auth.uid();
  v_email    text;
  v_terms    boolean := false;
  v_tour     boolean := false;
  v_onboard  boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '{"bypass_terms_acceptance": false, "bypass_guided_tour": false, "bypass_onboarding": false}'::jsonb;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT
    COALESCE(bool_or(bypass_terms_acceptance), false),
    COALESCE(bool_or(bypass_guided_tour),      false),
    COALESCE(bool_or(bypass_onboarding),       false)
  INTO v_terms, v_tour, v_onboard
  FROM public.qa_bypass_users
  WHERE is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (user_id = v_user_id OR email = v_email);

  RETURN jsonb_build_object(
    'bypass_terms_acceptance', v_terms,
    'bypass_guided_tour',      v_tour,
    'bypass_onboarding',       v_onboard
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_bypass_flags() TO authenticated;


-- ─── MANUAL QA CHECKLIST ────────────────────────────────────────────────────
-- After applying:
--   SELECT get_my_bypass_flags();                         -- should return all false
--   INSERT INTO qa_bypass_users (email, bypass_terms_acceptance, is_active)
--     VALUES ('test@example.com', true, true);
--   SELECT get_my_bypass_flags();                         -- if logged in as test@example.com → bypass_terms_acceptance=true
--   SELECT * FROM qa_bypass_users;                        -- as a normal user → should return 0 rows (RLS blocks)
