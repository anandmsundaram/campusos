-- Migration 041: Reconcile stale pending/countered offers + add single-seat
--               double-acceptance guard to accept_offer_atomic.
--
-- Part 1 — Data reconciliation (idempotent):
--   Any request with status IN ('matched','completed') should have no remaining
--   pending or countered offers. Migration 040 ensures this for future rows via
--   step 9 in accept_offer_atomic. This pass cleans up existing rows created
--   before migration 040 was deployed.
--
--   Safety conditions:
--   • Only touches offers with status IN ('pending','countered')
--   • Only on requests that are already fully matched or completed
--   • Does not delete offers; sets status to 'rejected'
--   • Idempotent: running again has no effect (already-rejected rows are skipped)
--   • Multi-seat note: 'matched' for multi-seat means all seats filled
--     (migration 040 step 7 logic), so this is correct.

UPDATE public.request_offers
SET status = 'rejected'
WHERE status IN ('pending', 'countered')
  AND request_id IN (
    SELECT id FROM public.requests
    WHERE status IN ('matched', 'completed')
  );

-- Part 2 — accept_offer_atomic: add step 5.1 (single-seat double-acceptance guard).
--
--   Race condition: if two concurrent RPC calls try to accept different offers
--   on the same single-seat request, the request-row lock (step 4, FOR UPDATE)
--   serializes them. However, step 5 only checked status IN ('open','matched'),
--   allowing the second call to succeed on an already-matched single-seat request.
--   Step 5.1 closes this gap by rejecting when the request is already matched
--   and there is no multi-seat capacity remaining.
--
--   Multi-seat note: for multi-seat rides the step 7 capacity check already
--   catches the fully-booked case via v_new_filled > v_request.available_seats,
--   so the guard is only needed for single-seat requests.

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

  -- 5.1. Single-seat guard: if the request is already matched and is NOT a
  --      multi-seat ride, reject immediately. Multi-seat fully-booked cases
  --      are caught by the capacity check in step 7.
  IF v_request.status = 'matched'
     AND (v_request.is_driver IS NOT TRUE OR v_request.available_seats IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request already has an accepted helper');
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

  -- 9. Reject all other pending/countered offers for this request.
  --    Only when the request just became matched (all seats filled for rides,
  --    always for single-helper requests) so remaining open seats stay available.
  IF v_new_status = 'matched' THEN
    UPDATE public.request_offers
    SET status = 'rejected'
    WHERE request_id = v_request.id
      AND id <> p_offer_id
      AND status IN ('pending', 'countered');
  END IF;

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
