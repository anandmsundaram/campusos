-- Migration 039: harden suspend_user / unsuspend_user security
--
-- Fixes two issues in migration 038:
--   1. PostgreSQL grants EXECUTE to PUBLIC by default; adding GRANT ... TO authenticated
--      does NOT revoke anon access. Explicitly revoke from PUBLIC.
--   2. `v_role NOT IN ('campus_admin', 'global_admin')` is NULL (falsy) when v_role IS NULL,
--      so unauthenticated callers (auth.uid() = null) bypassed the admin check. Fix with
--      an explicit IS NULL guard.

-- ─── Re-create with corrected NULL guard ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.suspend_user(p_target_id uuid, p_reason text DEFAULT 'Admin action')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT admin_role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('campus_admin', 'global_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  UPDATE public.profiles SET is_suspended = true WHERE id = p_target_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unsuspend_user(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT admin_role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('campus_admin', 'global_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  UPDATE public.profiles SET is_suspended = false WHERE id = p_target_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── Revoke PUBLIC access, then re-grant to authenticated only ────────────────

REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unsuspend_user(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.suspend_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unsuspend_user(uuid) TO authenticated;
