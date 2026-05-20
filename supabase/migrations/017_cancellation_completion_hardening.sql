-- Harden cancellation and completion state consistency.
--
-- Adds:
--   cancellation_reason, cancelled_by  on requests        (clearer cancel semantics)
--   no_show_reported, no_show_reported_by on request_offers (no-show tracking placeholder)
--   complete_request_safe()  — atomic, idempotent completion with transition guards
--   cancel_request_safe()    — atomic, idempotent cancellation with transition guards

-- ─── 1. Schema additions ──────────────────────────────────────────────────────

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS cancellation_reason text
    CHECK (cancellation_reason IN (
      'cancelled_by_requester', 'cancelled_by_helper', 'auto_cancelled', 'expired'
    )),
  ADD COLUMN IF NOT EXISTS cancelled_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.request_offers
  ADD COLUMN IF NOT EXISTS no_show_reported     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_reported_by  uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 2. complete_request_safe ─────────────────────────────────────────────────
-- Atomically marks a request as completed.
-- • Idempotent: already-completed → ok: true (safe for multi-tab / duplicate calls)
-- • Blocks completion of cancelled requests
-- • Auth: caller must be the requester OR have an accepted offer on the request

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

  -- Lock the request row for atomic transition.
  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  -- Idempotent: already completed is a silent success (duplicate completion is safe).
  IF v_request.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Block regression: cancelled requests cannot be completed.
  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This request has been cancelled and cannot be completed'
    );
  END IF;

  -- Auth: must be the requester OR an accepted helper.
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

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_request_safe(UUID) TO authenticated;


-- ─── 3. cancel_request_safe ───────────────────────────────────────────────────
-- Atomically marks a request as cancelled with a tracked reason.
-- • Idempotent: already-cancelled → ok: true
-- • Blocks cancellation of completed requests (no regression)
-- • Auth: only the requester can cancel (helper withdrawal is a separate offer flow)

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

  -- Lock the request row.
  SELECT * INTO v_request
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  -- Block cancellation of completed requests — completion is final.
  IF v_request.status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Completed requests cannot be cancelled'
    );
  END IF;

  -- Idempotent: already cancelled → silent success.
  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Auth: only the requester can cancel.
  IF v_request.requester_id <> v_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the requester can cancel this request');
  END IF;

  UPDATE public.requests
  SET status              = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_by        = v_caller_id
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_request_safe(UUID, TEXT) TO authenticated;
