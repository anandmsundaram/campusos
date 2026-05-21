-- Atomic passenger departure from an accepted ride.
--
-- Problem: the client previously did a two-step non-atomic write:
--   1. UPDATE request_offers SET status='rejected'
--   2. UPDATE requests SET seats_filled = stale_local_value - n
--
-- If step 2 failed, the offer was rejected but seats_filled was not decremented,
-- leaving a ghost seat that could never be filled. Two simultaneous departures
-- would also both read the same stale seats_filled from React state and compute
-- the same new value — under-counting the decrement.
--
-- Fix: single function that holds row locks and reads the live seat count from
-- the DB before decrementing.
--
-- Auth: only the passenger (helper_id on the offer) may call this.
--
-- ROLLBACK
-- --------
--   DROP FUNCTION IF EXISTS public.leave_ride_safe(UUID);
--   REVOKE EXECUTE ON FUNCTION public.leave_ride_safe(UUID) FROM authenticated;

CREATE OR REPLACE FUNCTION public.leave_ride_safe(
  p_offer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_offer      public.request_offers%ROWTYPE;
  v_request    public.requests%ROWTYPE;
  v_seats      INT;
  v_new_filled INT;
  v_new_status public.request_status;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- Lock the offer row — prevents concurrent leave attempts on the same offer.
  SELECT * INTO v_offer
  FROM public.request_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer not found');
  END IF;

  -- Auth: only the passenger (helper) can leave their own seat.
  IF v_offer.helper_id <> v_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  -- Idempotent: already-rejected offer is a silent success.
  IF v_offer.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'seats_filled', NULL, 'request_status', NULL);
  END IF;

  -- Can only leave an accepted seat (pending/countered offers use the normal withdraw path).
  IF v_offer.status <> 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Offer is not in accepted status');
  END IF;

  -- Lock the request row — reads LIVE seat count, blocks concurrent seat writes.
  SELECT * INTO v_request
  FROM public.requests
  WHERE id = v_offer.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  -- Reject the offer.
  UPDATE public.request_offers
  SET status = 'rejected'
  WHERE id = p_offer_id;

  -- Decrement seats for multi-seat driver rides; revert status if ride was matched.
  IF v_request.is_driver = true AND v_request.available_seats IS NOT NULL THEN
    v_seats      := COALESCE(v_offer.seats_requested, 1);
    v_new_filled := GREATEST(0, COALESCE(v_request.seats_filled, 0) - v_seats);
    v_new_status := CASE
      WHEN v_request.status = 'matched'::public.request_status
           AND v_new_filled < v_request.available_seats
        THEN 'open'::public.request_status
      ELSE v_request.status
    END;

    UPDATE public.requests
    SET seats_filled = v_new_filled,
        status       = v_new_status
    WHERE id = v_request.id;
  ELSE
    v_new_filled := v_request.seats_filled;
    v_new_status := v_request.status;
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'seats_filled',   v_new_filled,
    'request_status', v_new_status::text
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_ride_safe(UUID) TO authenticated;
