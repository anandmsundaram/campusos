-- Lightweight audit/event logging and notification job infrastructure.
--
-- Adds:
--   audit_events        — immutable append-only log of major marketplace actions
--   notification_jobs   — job queue backbone for future server-side retry processing
--   log_audit_event()   — exception-safe SECURITY DEFINER helper (called by RPCs only)
--
-- Modifies (CREATE OR REPLACE):
--   submit_offer_safe     → emits offer_submitted
--   accept_offer_atomic   → emits offer_accepted
--   complete_request_safe → emits request_completed
--   cancel_request_safe   → emits request_cancelled
--
-- Design principle: audit failure must NEVER roll back the business action.
-- log_audit_event() swallows all exceptions internally.


-- ─── 1. audit_events ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type      TEXT        NOT NULL
    CHECK (event_type IN (
      'offer_submitted',   'offer_accepted',
      'offer_rejected',    'counter_sent',    'counter_accepted',
      'request_completed', 'request_cancelled',
      'no_show_reported'
    )),
  request_id      UUID        REFERENCES public.requests(id) ON DELETE SET NULL,
  offer_id        UUID        REFERENCES public.request_offers(id) ON DELETE SET NULL,
  target_user_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_actor_idx   ON public.audit_events(actor_id);
CREATE INDEX IF NOT EXISTS audit_events_request_idx ON public.audit_events(request_id);
CREATE INDEX IF NOT EXISTS audit_events_target_idx  ON public.audit_events(target_user_id);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON public.audit_events(created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Users may read events where they are actor, target, or the request's requester.
-- No direct INSERT / UPDATE / DELETE — all writes go through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "audit_events_select" ON public.audit_events;
CREATE POLICY "audit_events_select" ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR target_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = audit_events.request_id
        AND r.requester_id = auth.uid()
    )
  );


-- ─── 2. notification_jobs ────────────────────────────────────────────────────
-- Backbone table for future server-side notification retry processing.
-- Client-side notification behavior is unchanged (see migration notes).

CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type                TEXT        NOT NULL,
  message             TEXT        NOT NULL,
  related_request_id  UUID        REFERENCES public.requests(id) ON DELETE SET NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  retry_count         INT         NOT NULL DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notification_jobs_user_idx   ON public.notification_jobs(user_id);
CREATE INDEX IF NOT EXISTS notification_jobs_status_idx ON public.notification_jobs(status, created_at DESC);

ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_jobs_select_own" ON public.notification_jobs;
CREATE POLICY "notification_jobs_select_own" ON public.notification_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ─── 3. log_audit_event ──────────────────────────────────────────────────────
-- Called only from SECURITY DEFINER RPCs — not granted to authenticated users.
-- Swallows all exceptions so a failed audit never blocks the business action.

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_actor_id       UUID,
  p_event_type     TEXT,
  p_request_id     UUID    DEFAULT NULL,
  p_offer_id       UUID    DEFAULT NULL,
  p_target_user_id UUID    DEFAULT NULL,
  p_metadata       JSONB   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
    actor_id, event_type, request_id, offer_id, target_user_id, metadata
  ) VALUES (
    p_actor_id, p_event_type, p_request_id, p_offer_id, p_target_user_id, p_metadata
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;


-- ─── 4. submit_offer_safe — add audit logging ─────────────────────────────────

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
  v_helper_id    UUID := auth.uid();
  v_request      public.requests%ROWTYPE;
  v_exist_status public.offer_status;
  v_offer_id     UUID;
BEGIN
  IF v_helper_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  IF v_request.requester_id = v_helper_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot offer on your own request');
  END IF;

  IF v_request.status NOT IN ('open', 'matched') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE v_request.status::text
        WHEN 'completed' THEN 'This request has already been completed'
        WHEN 'cancelled' THEN 'This request has been cancelled'
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


-- ─── 5. accept_offer_atomic — add audit logging ───────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_offer_atomic(
  p_offer_id    UUID,
  p_accepted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offer              public.request_offers%ROWTYPE;
  v_request            public.requests%ROWTYPE;
  v_seats              INT;
  v_new_filled         INT;
  v_new_status         public.request_status;
  v_final_agreed_price NUMERIC;
BEGIN
  SELECT * INTO v_offer
  FROM public.request_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer not found');
  END IF;

  IF v_offer.status NOT IN ('pending', 'countered') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This offer is no longer available');
  END IF;

  IF v_offer.helper_id <> p_accepted_by THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.requests
      WHERE id = v_offer.request_id
        AND requester_id = p_accepted_by
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
    END IF;
  END IF;

  SELECT * INTO v_request
  FROM public.requests
  WHERE id = v_offer.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  IF v_request.status NOT IN ('open', 'matched') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE v_request.status::text
        WHEN 'completed' THEN 'This request has already been completed'
        WHEN 'cancelled' THEN 'This request has been cancelled'
        ELSE 'This request is no longer active'
      END
    );
  END IF;

  IF v_request.scheduled_time IS NOT NULL
     AND v_request.scheduled_time < now() - interval '1 hour' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This ride has already departed');
  END IF;

  v_final_agreed_price := COALESCE(
    v_offer.requester_counter,
    v_offer.counter_budget,
    v_request.budget
  );

  IF v_request.is_driver = true AND v_request.available_seats IS NOT NULL THEN
    v_seats      := COALESCE(v_offer.seats_requested, 1);
    v_new_filled := COALESCE(v_request.seats_filled, 0) + v_seats;

    IF v_new_filled > v_request.available_seats THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'error', 'Not enough seats — only ' ||
                 (v_request.available_seats - COALESCE(v_request.seats_filled, 0))::text ||
                 ' seat(s) remaining'
      );
    END IF;

    v_new_status := CASE
      WHEN v_new_filled >= v_request.available_seats THEN 'matched'::public.request_status
      ELSE 'open'::public.request_status
    END;

    UPDATE public.requests
    SET seats_filled = v_new_filled,
        status       = v_new_status
    WHERE id = v_request.id;

  ELSE
    v_new_filled := NULL;
    v_new_status := 'matched'::public.request_status;
    UPDATE public.requests SET status = 'matched' WHERE id = v_request.id;
  END IF;

  UPDATE public.request_offers
  SET status             = 'accepted',
      final_agreed_price = v_final_agreed_price
  WHERE id = p_offer_id;

  PERFORM public.log_audit_event(
    p_accepted_by,
    'offer_accepted',
    v_request.id,
    p_offer_id,
    v_offer.helper_id,
    jsonb_build_object(
      'final_agreed_price', v_final_agreed_price,
      'request_status',     v_new_status::text
    )
  );

  RETURN jsonb_build_object(
    'ok',                 true,
    'helper_id',          v_offer.helper_id::text,
    'seats_filled',       v_new_filled,
    'request_status',     v_new_status::text,
    'final_agreed_price', v_final_agreed_price
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_offer_atomic(UUID, UUID) TO authenticated;


-- ─── 6. complete_request_safe — add audit logging ─────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_request_safe(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_request   public.requests%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  IF v_request.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This request has been cancelled and cannot be completed'
    );
  END IF;

  IF v_request.requester_id <> v_caller_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.request_offers
      WHERE request_id = p_request_id
        AND helper_id  = v_caller_id
        AND status     = 'accepted'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not authorized to complete this request');
    END IF;
  END IF;

  UPDATE public.requests
  SET status = 'completed'
  WHERE id = p_request_id;

  PERFORM public.log_audit_event(
    v_caller_id,
    'request_completed',
    p_request_id,
    NULL,
    NULL,
    NULL
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_request_safe(UUID) TO authenticated;


-- ─── 7. cancel_request_safe — add audit logging ───────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_request_safe(
  p_request_id UUID,
  p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_request   public.requests%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF p_reason NOT IN (
    'cancelled_by_requester', 'cancelled_by_helper', 'auto_cancelled', 'expired'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid cancellation reason');
  END IF;

  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  IF v_request.status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Completed requests cannot be cancelled'
    );
  END IF;

  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_request.requester_id <> v_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the requester can cancel this request');
  END IF;

  UPDATE public.requests
  SET status              = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_by        = v_caller_id
  WHERE id = p_request_id;

  PERFORM public.log_audit_event(
    v_caller_id,
    'request_cancelled',
    p_request_id,
    NULL,
    NULL,
    jsonb_build_object('cancellation_reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_request_safe(UUID, TEXT) TO authenticated;


-- ─── ROLLBACK PLAN ────────────────────────────────────────────────────────────
-- To revert this migration entirely:
--
--   DROP FUNCTION IF EXISTS public.log_audit_event(UUID, TEXT, UUID, UUID, UUID, JSONB);
--   DROP TABLE IF EXISTS public.audit_events;
--   DROP TABLE IF EXISTS public.notification_jobs;
--
-- Then restore the previous versions of the four RPCs from migration 017 / 016:
--
--   submit_offer_safe     → migration 016 body (no audit PERFORM call, no v_offer_id DECLARE)
--   accept_offer_atomic   → migration 016 body (no audit PERFORM call)
--   complete_request_safe → migration 017 body (no audit PERFORM call)
--   cancel_request_safe   → migration 017 body (no audit PERFORM call)
--
-- The RPC signatures are unchanged — no client code changes required on rollback.
-- The tables have no foreign key dependents, so DROP TABLE is safe without CASCADE.


-- ─── MANUAL QA CHECKLIST ─────────────────────────────────────────────────────
-- After running this migration in the Supabase SQL Editor:
--
-- 1. Table existence
--    SELECT * FROM public.audit_events LIMIT 0;          -- should return 0 rows, no error
--    SELECT * FROM public.notification_jobs LIMIT 0;     -- same
--
-- 2. Submit an offer → verify audit row
--    As a helper, submit an offer on any open request.
--    SELECT * FROM public.audit_events ORDER BY created_at DESC LIMIT 1;
--    Expected: event_type = 'offer_submitted', actor_id = helper UUID,
--              target_user_id = requester UUID, metadata has counter_budget + seats_requested.
--
-- 3. Accept an offer → verify audit row
--    As the requester, accept the offer from step 2.
--    Expected: event_type = 'offer_accepted', actor_id = requester UUID,
--              target_user_id = helper UUID, metadata has final_agreed_price + request_status.
--
-- 4. Complete a request → verify audit row
--    Call complete_request_safe on a matched request.
--    Expected: event_type = 'request_completed', actor_id = completer UUID.
--
-- 5. Cancel a request → verify audit row
--    Call cancel_request_safe with 'cancelled_by_requester'.
--    Expected: event_type = 'request_cancelled', metadata.cancellation_reason = 'cancelled_by_requester'.
--
-- 6. Audit is read-only from client
--    In a browser JS console (logged in): supabase.from('audit_events').insert({...})
--    Expected: RLS rejects the INSERT with a permission error.
--
-- 7. No client code regressions
--    Navigate: Dashboard → My Requests → submit offer, accept offer, complete, cancel.
--    All flows should complete with no console errors.
--    Existing client-side notifications should still fire as before.
--
-- 8. Duplicate audit safety
--    Manually corrupt an audit_events row to have an invalid event_type.
--    The CHECK constraint should reject it; confirm it does not silently insert.


-- ─── FUTURE CRON / RETRY RECOMMENDATION ──────────────────────────────────────
-- The notification_jobs table is wired up but not yet populated by RPCs.
-- Recommended next steps:
--
-- Phase 1 — Populate jobs from RPCs (migration 019):
--   In each RPC that currently creates client-side notifications, also INSERT a row
--   into notification_jobs with status='pending'. Keep the client-side path as fallback.
--
-- Phase 2 — Supabase Edge Function worker:
--   Deploy a scheduled Edge Function (every 60 s) that:
--     SELECT * FROM notification_jobs WHERE status = 'pending' AND retry_count < 3 FOR UPDATE SKIP LOCKED
--     For each row: send the notification via Supabase Realtime / push / email.
--     On success: UPDATE status='sent', sent_at=now()
--     On failure: UPDATE retry_count = retry_count + 1, error_message = <err>,
--                  status = CASE WHEN retry_count+1 >= 3 THEN 'failed' ELSE 'pending' END
--
-- Phase 3 — Retire client-side notification creation:
--   Once the worker has proved reliable in production, remove the duplicate
--   client-side notification INSERT calls and rely solely on the job table.
--
-- Phase 4 — Alert on 'failed' jobs:
--   Add a Supabase alert or daily digest query:
--     SELECT * FROM notification_jobs WHERE status = 'failed' AND created_at > now() - interval '24h';
