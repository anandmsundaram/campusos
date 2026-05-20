-- Harden offer validity: prevent duplicate active offers, self-offers, offers
-- on full/expired/completed requests, and stale counter/decline actions.
--
-- Adds two functions:
--   submit_offer_safe   – replaces the client-side direct INSERT; full validation
--   validate_offer_action – lightweight read-only check before counter/decline
--
-- Also replaces accept_offer_atomic to add the missing expiry check.

-- ─── 1. submit_offer_safe ─────────────────────────────────────────────────────
-- Atomically validates and creates a new offer.
-- Caller does NOT pass helper_id — uses auth.uid() for tamper-proof attribution.

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
  v_helper_id  UUID := auth.uid();
  v_request    public.requests%ROWTYPE;
  v_exist_status public.offer_status;
BEGIN
  IF v_helper_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- Lock the request row to serialise concurrent submissions.
  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  -- Self-offer guard.
  IF v_request.requester_id = v_helper_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot offer on your own request');
  END IF;

  -- Request must be open or matched.
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

  -- Expiry check — 1-hour grace window mirrors the auto-complete threshold.
  IF v_request.scheduled_time IS NOT NULL
     AND v_request.scheduled_time < now() - interval '1 hour' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This ride has already departed');
  END IF;

  -- Seat capacity check for multi-seat driver rides.
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

  -- Duplicate active-offer check.
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
      -- 'rejected': the DB UNIQUE constraint prevents a second row.
      RETURN jsonb_build_object('ok', false, 'error', 'You have already offered on this request');
    END IF;
  END IF;

  -- Insert the offer.
  INSERT INTO public.request_offers (
    request_id, helper_id, message, counter_budget, seats_requested, status
  ) VALUES (
    p_request_id,
    v_helper_id,
    p_message,
    p_counter_budget,
    COALESCE(p_seats_requested, 1),
    'pending'
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_offer_safe(UUID, TEXT, NUMERIC, INT) TO authenticated;


-- ─── 2. validate_offer_action ─────────────────────────────────────────────────
-- Lightweight read-only check: is this request still actionable?
-- Call before counter/decline to give a human-readable error on stale state.

CREATE OR REPLACE FUNCTION public.validate_offer_action(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status         public.request_status;
  v_scheduled_time timestamptz;
BEGIN
  SELECT status, scheduled_time
  INTO v_status, v_scheduled_time
  FROM public.requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  IF v_status NOT IN ('open', 'matched') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE v_status::text
        WHEN 'completed' THEN 'This request has already been completed'
        WHEN 'cancelled' THEN 'This request has been cancelled'
        ELSE 'This request is no longer active'
      END
    );
  END IF;

  IF v_scheduled_time IS NOT NULL
     AND v_scheduled_time < now() - interval '1 hour' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This ride has already departed');
  END IF;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_offer_action(UUID) TO authenticated;


-- ─── 3. accept_offer_atomic — add missing expiry check ───────────────────────
-- Re-deploys the full function from migration 015 with an expiry guard
-- inserted after the request-status check (step 5 → 5.5).

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
  -- 1. Lock the offer row.
  SELECT * INTO v_offer
  FROM public.request_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer not found');
  END IF;

  -- 2. Offer must still be actionable.
  IF v_offer.status NOT IN ('pending', 'countered') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This offer is no longer available');
  END IF;

  -- 3. Auth: caller must be the requester OR the helper.
  IF v_offer.helper_id <> p_accepted_by THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.requests
      WHERE id = v_offer.request_id
        AND requester_id = p_accepted_by
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
    END IF;
  END IF;

  -- 4. Lock the request row — reads LIVE seat count.
  SELECT * INTO v_request
  FROM public.requests
  WHERE id = v_offer.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  -- 5. Request must still be open or matched.
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

  -- 5.5. Expiry check.
  IF v_request.scheduled_time IS NOT NULL
     AND v_request.scheduled_time < now() - interval '1 hour' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This ride has already departed');
  END IF;

  -- 6. Capture the canonical price.
  v_final_agreed_price := COALESCE(
    v_offer.requester_counter,
    v_offer.counter_budget,
    v_request.budget
  );

  -- 7. Capacity check for multi-seat driver rides.
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

  -- 8. Accept the offer and stamp the immutable final price.
  UPDATE public.request_offers
  SET status             = 'accepted',
      final_agreed_price = v_final_agreed_price
  WHERE id = p_offer_id;

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
