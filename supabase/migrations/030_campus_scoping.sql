-- ============================================================
-- 030: Campus scoping / tenant isolation
-- COS-P25-CAMPUS-SCOPING-TENANT-ISOLATION
--
-- Adds multi-tenant campus isolation:
--   • campuses table (TAMU + UT Austin seeded)
--   • campus_id on profiles (backfilled → TAMU)
--   • campus_id on requests (backfilled from requester, auto-set by trigger)
--   • RLS: requests visible only within same campus
--   • submit_offer_safe: campus guard added
--   • handle_new_user: assigns campus by email domain
--
-- Apply via Supabase Dashboard → SQL Editor.
-- ============================================================


-- ─── 1. campuses table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campuses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  city        text        NOT NULL,
  state       text        NOT NULL,
  domain_hint text,
  lat         decimal(9,6),
  lng         decimal(9,6),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campuses: anyone authenticated can view" ON public.campuses;
CREATE POLICY "campuses: anyone authenticated can view"
  ON public.campuses FOR SELECT
  TO authenticated
  USING (true);

-- Seed campuses (idempotent)
INSERT INTO public.campuses (slug, name, city, state, domain_hint, lat, lng) VALUES
  ('tamu',      'Texas A&M University',              'College Station', 'TX', 'tamu.edu',   30.618000, -96.336500),
  ('ut-austin', 'University of Texas at Austin',     'Austin',          'TX', 'utexas.edu', 30.284900, -97.734100)
ON CONFLICT (slug) DO NOTHING;


-- ─── 2. campus_id on profiles ─────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id);

-- Backfill all existing profiles → TAMU (default for current beta cohort)
UPDATE public.profiles
SET campus_id = (SELECT id FROM public.campuses WHERE slug = 'tamu')
WHERE campus_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN campus_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_campus_id_idx ON public.profiles(campus_id);


-- ─── 3. campus_id on requests ────────────────────────────────────────────────

ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id);

-- Backfill requests from requester's profile campus
UPDATE public.requests r
SET campus_id = (SELECT campus_id FROM public.profiles WHERE id = r.requester_id)
WHERE r.campus_id IS NULL;

-- Catch orphaned requests (requester has no profile) → TAMU
UPDATE public.requests
SET campus_id = (SELECT id FROM public.campuses WHERE slug = 'tamu')
WHERE campus_id IS NULL;

ALTER TABLE public.requests ALTER COLUMN campus_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS requests_campus_id_idx ON public.requests(campus_id);


-- ─── 4. Trigger: auto-set campus_id on request INSERT ───────────────────────
-- Reads campus_id from the requester's profile. Runs BEFORE INSERT so the
-- trigger-corrected value is what RLS WITH CHECK evaluates.
-- Client-supplied campus_id is always overwritten — spoofing is impossible.

CREATE OR REPLACE FUNCTION public.set_request_campus()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  SELECT campus_id INTO NEW.campus_id
  FROM public.profiles
  WHERE id = NEW.requester_id;

  IF NEW.campus_id IS NULL THEN
    RAISE EXCEPTION 'requester % has no campus assigned', NEW.requester_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS requests_auto_set_campus ON public.requests;
CREATE TRIGGER requests_auto_set_campus
  BEFORE INSERT ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_request_campus();


-- ─── 5. Update RLS on requests ───────────────────────────────────────────────

-- SELECT: campus-scoped (users only see requests from their own campus)
DROP POLICY IF EXISTS "requests: anyone authenticated can view" ON public.requests;
CREATE POLICY "requests: campus members can view"
  ON public.requests FOR SELECT
  TO authenticated
  USING (
    campus_id = (SELECT campus_id FROM public.profiles WHERE id = auth.uid())
  );

-- INSERT: trigger sets campus_id; RLS only needs to verify requester ownership
DROP POLICY IF EXISTS "requests: requester can insert" ON public.requests;
CREATE POLICY "requests: requester can insert"
  ON public.requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

-- UPDATE / DELETE policies unchanged (requester can modify own requests only)


-- ─── 6. submit_offer_safe — add campus isolation guard ───────────────────────
-- SECURITY DEFINER bypasses RLS on the internal INSERT; the explicit campus
-- check is therefore the only enforcement for cross-campus offer attempts.

CREATE OR REPLACE FUNCTION public.submit_offer_safe(
  p_request_id      UUID,
  p_message         TEXT,
  p_counter_budget  NUMERIC,
  p_seats_requested INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_helper_id     UUID := auth.uid();
  v_request       public.requests%ROWTYPE;
  v_exist_status  public.offer_status;
  v_offer_id      UUID;
  v_helper_campus UUID;
BEGIN
  IF v_helper_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT campus_id INTO v_helper_campus
  FROM public.profiles
  WHERE id = v_helper_id;

  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  -- Campus isolation guard — block cross-campus offers
  IF v_request.campus_id IS DISTINCT FROM v_helper_campus THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request is not available at your campus');
  END IF;

  IF v_request.requester_id = v_helper_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot offer on your own request');
  END IF;

  IF v_request.status NOT IN ('open', 'matched') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE v_request.status::text
        WHEN 'completed' THEN 'This request has already been completed'
        WHEN 'cancelled'  THEN 'This request has been cancelled'
        ELSE 'This request is no longer accepting offers'
      END
    );
  END IF;

  IF v_request.scheduled_time IS NOT NULL
     AND v_request.scheduled_time < now() - interval '1 hour' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This ride has already departed');
  END IF;

  IF v_request.is_driver = true AND v_request.available_seats IS NOT NULL THEN
    IF COALESCE(v_request.seats_filled, 0) + COALESCE(p_seats_requested, 1) > v_request.available_seats THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Not enough seats available — only ' ||
                 (v_request.available_seats - COALESCE(v_request.seats_filled, 0))::text ||
                 ' seat(s) remaining'
      );
    END IF;
  END IF;

  SELECT status INTO v_exist_status
  FROM public.request_offers
  WHERE request_id = p_request_id
    AND helper_id  = v_helper_id;

  IF FOUND THEN
    IF v_exist_status IN ('pending', 'countered') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'You already have a pending offer on this request');
    ELSIF v_exist_status = 'accepted' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Your offer was already accepted for this request');
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'You have already offered on this request');
    END IF;
  END IF;

  INSERT INTO public.request_offers (
    request_id, helper_id, message, counter_budget, seats_requested, status
  ) VALUES (
    p_request_id,
    v_helper_id,
    p_message,
    p_counter_budget,
    COALESCE(p_seats_requested, 1),
    'pending'
  )
  RETURNING id INTO v_offer_id;

  PERFORM public.log_audit_event(
    v_helper_id,
    'offer_submitted',
    p_request_id,
    v_offer_id,
    v_request.requester_id,
    jsonb_build_object(
      'counter_budget',  p_counter_budget,
      'seats_requested', COALESCE(p_seats_requested, 1)
    )
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_offer_safe(UUID, TEXT, NUMERIC, INT) TO authenticated;


-- ─── 7. handle_new_user — assign campus from email domain ────────────────────
-- Matches domain_hint (e.g. tamu.edu → TAMU). Falls back to TAMU for
-- unrecognized domains during beta (will be extended for other campuses).

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

  SELECT id INTO v_campus_id
  FROM public.campuses
  WHERE domain_hint = v_domain
  LIMIT 1;

  -- Default to TAMU for unrecognized domains in the current beta cohort
  IF v_campus_id IS NULL THEN
    SELECT id INTO v_campus_id FROM public.campuses WHERE slug = 'tamu' LIMIT 1;
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


-- ─── Manual QA checklist ──────────────────────────────────────────────────────
-- After applying:
--   SELECT id, slug, name, city FROM public.campuses;
--   -- → 2 rows: tamu + ut-austin
--
--   SELECT count(*) FROM public.profiles WHERE campus_id IS NULL;
--   -- → 0
--
--   SELECT count(*) FROM public.requests WHERE campus_id IS NULL;
--   -- → 0
--
--   -- Verify trigger blocks spoof: insert request with wrong campus_id from a
--   -- session where auth.uid() belongs to a TAMU profile:
--   -- SELECT campus_id FROM public.requests WHERE requester_id = auth.uid()
--   --   ORDER BY created_at DESC LIMIT 1;
--   -- → should always match the requester's profile campus_id, never the
--   --   client-supplied value
