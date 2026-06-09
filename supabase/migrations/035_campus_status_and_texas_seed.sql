-- Migration 035: campus status field + Texas university baseline
--
-- Adds a factual status field to campuses so the system can distinguish
-- active_beta (accepting signups), waitlist (coming soon), and disabled campuses
-- without hardcoding domain lists in application code.
-- Adds UT Dallas as active_beta and seeds major Texas campuses as waitlist.

-- ─── 1. status column on campuses ─────────────────────────────────────────────

ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS status text
    NOT NULL DEFAULT 'active_beta'
    CHECK (status IN ('active_beta', 'waitlist', 'disabled'));

-- Mark existing campuses explicitly active_beta (already the default, belt-and-suspenders)
UPDATE public.campuses SET status = 'active_beta' WHERE slug IN ('tamu', 'ut-austin');

-- ─── 2. Texas university baseline ─────────────────────────────────────────────
-- Only Texas campuses. active_beta = live now, waitlist = future launch.
-- Adding a new campus requires only an INSERT here — no code changes.

INSERT INTO public.campuses (slug, name, city, state, domain_hint, status, lat, lng) VALUES
  ('ut-dallas', 'University of Texas at Dallas',     'Richardson',  'TX', 'utdallas.edu', 'active_beta', 32.9887, -96.7498),
  ('uh-main',   'University of Houston',             'Houston',     'TX', 'uh.edu',        'waitlist',   29.7198, -95.3417),
  ('utsa',      'University of Texas at San Antonio','San Antonio', 'TX', 'utsa.edu',      'waitlist',   29.5831, -98.6202),
  ('ttu',       'Texas Tech University',             'Lubbock',     'TX', 'ttu.edu',       'waitlist',   33.5843, -101.8746),
  ('tcu',       'Texas Christian University',        'Fort Worth',  'TX', 'tcu.edu',       'waitlist',   32.7096, -97.3627),
  ('baylor',    'Baylor University',                 'Waco',        'TX', 'baylor.edu',    'waitlist',   31.5485, -97.1161),
  ('smu',       'Southern Methodist University',     'Dallas',      'TX', 'smu.edu',       'waitlist',   32.8411, -96.7852),
  ('rice',      'Rice University',                   'Houston',     'TX', 'rice.edu',      'waitlist',   29.7174, -95.4018)
ON CONFLICT (slug) DO UPDATE SET
  status     = EXCLUDED.status,
  domain_hint = COALESCE(EXCLUDED.domain_hint, public.campuses.domain_hint);

-- ─── 3. Helper function: look up campus by email domain respecting status ──────
-- Returns campus id only for active_beta campuses. Returns NULL for waitlist/disabled.
-- Used by signup logic to decide whether to proceed or show a waitlist message.

CREATE OR REPLACE FUNCTION public.get_campus_for_domain(p_domain text)
RETURNS TABLE (campus_id uuid, campus_status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, status
  FROM public.campuses
  WHERE domain_hint = lower(trim(p_domain))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_campus_for_domain(text) TO authenticated, anon;
