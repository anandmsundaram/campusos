-- Migration 036: campus status gate in handle_new_user trigger
--
-- Problem: migration 030 fell back to TAMU for unrecognized domains.
-- Migration 035 added waitlist campuses WITH domain_hints, so those domains
-- now match and get waitlist campus_id assigned — allowing waitlist-campus
-- users to enter the marketplace.
--
-- Fix: only match campuses with status = 'active_beta'. For all other domains
-- (waitlist, disabled, or unknown) fall back to TAMU. The app-level gate in
-- signup/page.tsx shows a "coming soon" message before the auth user is created,
-- so this trigger is defense-in-depth.

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_domain    text;
  v_campus_id uuid;
BEGIN
  v_domain := split_part(new.email, '@', 2);

  -- Only assign active_beta campuses — waitlist/disabled domains fall through
  SELECT id INTO v_campus_id
  FROM public.campuses
  WHERE domain_hint = v_domain
    AND status = 'active_beta'
  LIMIT 1;

  -- Default to TAMU for whitelisted non-.edu users and any unrecognised domain
  IF v_campus_id IS NULL THEN
    SELECT id INTO v_campus_id
    FROM public.campuses
    WHERE slug = 'tamu'
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, name, university, major, year, campus_id)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'university',
    new.raw_user_meta_data ->> 'major',
    new.raw_user_meta_data ->> 'year',
    v_campus_id
  );
  RETURN new;
END;
$$;
