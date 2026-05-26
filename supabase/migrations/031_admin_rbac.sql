-- Migration 031: Admin RBAC
-- Replaces hardcoded email-based admin checks with admin_role column on profiles.
-- admin_role values: 'user' (default), 'campus_admin', 'global_admin'
-- campus_admin: scoped to their own campus_id
-- global_admin: cross-campus access, unrestricted by campus filter

BEGIN;

-- ── 1. Add admin_role to profiles ──────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role text NOT NULL DEFAULT 'user'
    CHECK (admin_role IN ('user', 'campus_admin', 'global_admin'));

-- ── 2. Backfill existing admin users (already hardcoded in Sidebar.tsx and
--       admin/page.tsx in the committed codebase) to global_admin. ─────────────
UPDATE public.profiles
SET admin_role = 'global_admin'
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'anandmsundaram@gmail.com',
    'campusosapp@gmail.com',
    'valsgum@gmail.com'
  )
);

-- ── 3. Helper functions (SECURITY DEFINER — read profile without hitting RLS) ──

CREATE OR REPLACE FUNCTION public.current_user_role()
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN (SELECT admin_role FROM public.profiles WHERE id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT admin_role = 'global_admin' FROM public.profiles WHERE id = auth.uid()),
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_campus_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT admin_role IN ('campus_admin', 'global_admin') FROM public.profiles WHERE id = auth.uid()),
    false
  );
END;
$$;

-- Returns true when the calling user can administer the given campus:
--   global_admin  → always true
--   campus_admin  → true only when target_campus_id = their own campus_id
--   user          → always false
CREATE OR REPLACE FUNCTION public.can_admin_campus(target_campus_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_role     text;
  v_campus   uuid;
BEGIN
  SELECT admin_role, campus_id INTO v_role, v_campus
  FROM public.profiles WHERE id = auth.uid();
  IF v_role = 'global_admin' THEN RETURN true; END IF;
  IF v_role = 'campus_admin' THEN RETURN v_campus = target_campus_id; END IF;
  RETURN false;
END;
$$;

-- ── 4. Replace email-based analytics admin policy ───────────────────────────────
DROP POLICY IF EXISTS "analytics_select_admin" ON public.analytics_events;
CREATE POLICY "analytics_events: global admin can view"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (public.is_global_admin());

-- ── 5. Replace email-based reports admin policies ───────────────────────────────
DROP POLICY IF EXISTS "reports_select_admin" ON public.reports;
DROP POLICY IF EXISTS "reports_update_admin" ON public.reports;
CREATE POLICY "reports: campus admin can view"
  ON public.reports FOR SELECT TO authenticated
  USING (public.is_campus_admin());
CREATE POLICY "reports: campus admin can update"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.is_campus_admin());

-- ── 6. Global admin can read all requests (bypasses campus member filter) ───────
CREATE POLICY "requests: global admin can view all"
  ON public.requests FOR SELECT TO authenticated
  USING (public.is_global_admin());

-- ── 7. Admin can view offers scoped to their admined campus ─────────────────────
CREATE POLICY "request_offers: admin can view campus offers"
  ON public.request_offers FOR SELECT TO authenticated
  USING (
    public.can_admin_campus(
      (SELECT campus_id FROM public.requests WHERE id = request_id)
    )
  );

-- ── 8. Admin can view audit events scoped to their admined campus ───────────────
-- Events with null request_id (non-request events) are visible to global_admin only.
DROP POLICY IF EXISTS "audit_events_select" ON public.audit_events;
CREATE POLICY "audit_events: own events or admin"
  ON public.audit_events FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR target_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = audit_events.request_id
        AND r.requester_id = auth.uid()
    )
    OR public.is_global_admin()
    OR (
      public.is_campus_admin()
      AND request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id = audit_events.request_id
          AND public.can_admin_campus(r.campus_id)
      )
    )
  );

COMMIT;
