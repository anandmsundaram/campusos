-- Migration 038: user suspension + email registration check RPCs
--
-- Adds:
--   1. profiles.is_suspended  — admin flag to block marketplace access
--   2. is_email_registered()  — anon-accessible; used by signup to prevent duplicate accounts
--   3. is_user_suspended()    — anon-accessible; used by signup when email is already registered
--   4. suspend_user()         — admin-only; sets is_suspended = true
--   5. unsuspend_user()       — admin-only; clears is_suspended
--
-- Security: is_email_registered/is_user_suspended are SECURITY DEFINER.
-- Email enumeration is acceptable after campus/whitelist gating (per product spec).

-- ─── 1. Add is_suspended to profiles ─────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- ─── 2. is_email_registered — anon-accessible ────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_email_registered(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = lower(trim(p_email))
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO anon, authenticated;

-- ─── 3. is_user_suspended — anon-accessible ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_user_suspended(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT p.is_suspended
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE u.email = lower(trim(p_email))
        AND u.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_suspended(text) TO anon, authenticated;

-- ─── 4. suspend_user — admin-only ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.suspend_user(p_target_id uuid, p_reason text DEFAULT 'Admin action')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT admin_role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('campus_admin', 'global_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  UPDATE public.profiles SET is_suspended = true WHERE id = p_target_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.suspend_user(uuid, text) TO authenticated;

-- ─── 5. unsuspend_user — admin-only ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unsuspend_user(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT admin_role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('campus_admin', 'global_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  UPDATE public.profiles SET is_suspended = false WHERE id = p_target_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsuspend_user(uuid) TO authenticated;
