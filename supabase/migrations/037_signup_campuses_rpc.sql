-- Migration 037: get_signup_campuses() RPC for anon access
--
-- The signup page is unauthenticated (no session), so it cannot query the
-- campuses table directly (RLS requires authenticated role).
-- This SECURITY DEFINER function exposes only the public fields needed for
-- the university dropdown — no sensitive campus admin data.

CREATE OR REPLACE FUNCTION public.get_signup_campuses()
RETURNS TABLE (id uuid, name text, slug text, status text, domain_hint text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, slug, status, domain_hint
  FROM public.campuses
  WHERE status != 'disabled'
  ORDER BY
    CASE status WHEN 'active_beta' THEN 0 ELSE 1 END,
    name;
$$;

GRANT EXECUTE ON FUNCTION public.get_signup_campuses() TO anon, authenticated;
