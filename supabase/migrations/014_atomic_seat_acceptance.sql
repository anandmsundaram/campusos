-- Atomic seat acceptance to prevent overbooking via race conditions.
--
-- Problem: the client was doing a 3-step non-atomic sequence:
--   1. UPDATE request_offers SET status='accepted'
--   2. Read seats_filled from stale client-side state
--   3. UPDATE requests SET seats_filled = stale_value + n
--
-- Two concurrent callers both read the same stale value, both pass the
-- capacity check, and both get accepted — overselling the last seat.
--
-- Fix: single function that holds row locks on both tables for the
-- duration of the transaction, reads live seat counts from the DB, and
-- rejects atomically if capacity is exceeded.

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
  v_offer      public.request_offers%ROWTYPE;
  v_request    public.requests%ROWTYPE;
  v_seats      INT;
  v_new_filled INT;
  v_new_status public.request_status;
BEGIN
  -- 1. Lock the offer row — serialises concurrent acceptance attempts on the same offer.
  SELECT * INTO v_offer
  FROM public.request_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer not found');
  END IF;

  -- 2. Offer must still be actionable (pending or countered).
  IF v_offer.status NOT IN ('pending', 'countered') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This offer is no longer available');
  END IF;

  -- 3. Auth: caller must be the requester (accepting helper's offer)
  --    OR the helper themselves (accepting requester's counter-offer).
  IF v_offer.helper_id <> p_accepted_by THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.requests
      WHERE id = v_offer.request_id
        AND requester_id = p_accepted_by
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
    END IF;
  END IF;

  -- 4. Lock the request row — reads LIVE seat count, blocks any concurrent seat writes.
  SELECT * INTO v_request
  FROM public.requests
  WHERE id = v_offer.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  -- 5. Request must still be open or matched.
  IF v_request.status NOT IN ('open', 'matched') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request is no longer accepting offers');
  END IF;

  -- 6. Capacity check for multi-seat driver rides.
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
    -- Non-multi-seat (task or is_driver=false ride): just mark matched.
    v_new_filled := NULL;
    v_new_status := 'matched'::public.request_status;
    UPDATE public.requests SET status = 'matched' WHERE id = v_request.id;
  END IF;

  -- 7. Accept the offer atomically with the request update.
  UPDATE public.request_offers
  SET status = 'accepted'
  WHERE id = p_offer_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'helper_id',      v_offer.helper_id::text,
    'seats_filled',   v_new_filled,
    'request_status', v_new_status::text
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_offer_atomic(UUID, UUID) TO authenticated;
