-- Migration 033: User blocking and abuse safety
-- Adds user_blocks and safety_events tables, blocking helper functions,
-- and updates submit_offer_safe with a blocking guard.

BEGIN;

-- ── 1. user_blocks table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id      UUID REFERENCES public.campuses(id),
  reason         TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  unblocked_at   TIMESTAMPTZ,
  unblock_reason TEXT,
  CONSTRAINT user_blocks_no_self_block CHECK (blocker_id != blocked_id)
);

-- Only one active block per ordered pair
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_active_unique
  ON public.user_blocks (blocker_id, blocked_id)
  WHERE is_active = true;

-- ── 2. safety_events table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL CHECK (event_type IN ('block', 'unblock')),
  actor_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  campus_id       UUID REFERENCES public.campuses(id),
  reason          TEXT NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_blocks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_events  ENABLE ROW LEVEL SECURITY;

-- user_blocks: I can read blocks where I'm the blocker or the blocked party
CREATE POLICY "user_blocks: read own"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

-- user_blocks: I can create a block where I'm the blocker
CREATE POLICY "user_blocks: insert own"
  ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

-- user_blocks: I can update (deactivate) blocks I created
CREATE POLICY "user_blocks: update own"
  ON public.user_blocks FOR UPDATE TO authenticated
  USING (blocker_id = auth.uid());

-- campus_admin / global_admin can view blocks relevant to their campus
CREATE POLICY "user_blocks: admin can view campus"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (public.can_admin_campus(campus_id));

-- safety_events: actor can insert their own events
CREATE POLICY "safety_events: insert own"
  ON public.safety_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- safety_events: campus_admin sees events for their campus
CREATE POLICY "safety_events: campus admin can view"
  ON public.safety_events FOR SELECT TO authenticated
  USING (public.is_campus_admin() AND public.can_admin_campus(campus_id));

-- safety_events: global_admin sees all
CREATE POLICY "safety_events: global admin can view all"
  ON public.safety_events FOR SELECT TO authenticated
  USING (public.is_global_admin());

-- ── 4. is_blocked_between — SECURITY DEFINER helper ─────────────────────────
CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a UUID, user_b UUID)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE is_active = true
      AND (
        (blocker_id = user_a AND blocked_id = user_b)
        OR (blocker_id = user_b AND blocked_id = user_a)
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID) TO authenticated;

-- ── 5. block_user RPC ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.block_user(p_target_id UUID, p_reason TEXT)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_blocker_id UUID := auth.uid();
  v_campus_id  UUID;
  v_block_id   UUID;
BEGIN
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF v_blocker_id = p_target_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot block yourself');
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A reason is required to block a user');
  END IF;

  SELECT campus_id INTO v_campus_id FROM public.profiles WHERE id = v_blocker_id;

  IF public.is_blocked_between(v_blocker_id, p_target_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User is already blocked');
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id, campus_id, reason)
  VALUES (v_blocker_id, p_target_id, v_campus_id, p_reason)
  RETURNING id INTO v_block_id;

  INSERT INTO public.safety_events (event_type, actor_id, target_user_id, campus_id, reason, metadata)
  VALUES ('block', v_blocker_id, p_target_id, v_campus_id, p_reason,
          jsonb_build_object('block_id', v_block_id));

  RETURN jsonb_build_object('ok', true, 'block_id', v_block_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user(UUID, TEXT) TO authenticated;

-- ── 6. unblock_user RPC ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unblock_user(p_block_id UUID, p_reason TEXT)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_blocker_id UUID := auth.uid();
  v_block      public.user_blocks%ROWTYPE;
BEGIN
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A reason is required to unblock a user');
  END IF;

  SELECT * INTO v_block FROM public.user_blocks WHERE id = p_block_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Block record not found');
  END IF;
  IF v_block.blocker_id != v_blocker_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You can only unblock users you have blocked');
  END IF;
  IF NOT v_block.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User is already unblocked');
  END IF;

  UPDATE public.user_blocks
  SET is_active = false, unblocked_at = now(), unblock_reason = p_reason, updated_at = now()
  WHERE id = p_block_id;

  INSERT INTO public.safety_events (event_type, actor_id, target_user_id, campus_id, reason, metadata)
  VALUES ('unblock', v_blocker_id, v_block.blocked_id, v_block.campus_id, p_reason,
          jsonb_build_object('block_id', p_block_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unblock_user(UUID, TEXT) TO authenticated;

-- ── 7. get_my_blocks RPC ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_blocks()
  RETURNS TABLE (
    id            UUID,
    blocked_id    UUID,
    blocked_name  TEXT,
    reason        TEXT,
    created_at    TIMESTAMPTZ
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ub.id,
    ub.blocked_id,
    p.name,
    ub.reason,
    ub.created_at
  FROM public.user_blocks ub
  JOIN public.profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = auth.uid()
    AND ub.is_active = true
  ORDER BY ub.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_blocks() TO authenticated;

-- ── 8. Update submit_offer_safe with blocking guard ───────────────────────────
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

  -- Campus isolation guard
  IF v_request.campus_id IS DISTINCT FROM v_helper_campus THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request is not available at your campus');
  END IF;

  -- Blocking guard — neither party may offer when blocked
  IF public.is_blocked_between(v_helper_id, v_request.requester_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot offer on this request');
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

-- ── 9. Restrictive RLS: blocked helper cannot update offers on blocked requester's request ──
-- This prevents a blocked helper from responding to counter-offers.
CREATE POLICY "request_offers: blocked helper cannot update"
  ON public.request_offers AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    -- If the person updating is NOT the helper, allow (requester side, unrestricted)
    helper_id != auth.uid()
    OR
    -- If they ARE the helper, only allow if NOT blocked by the requester
    NOT public.is_blocked_between(
      auth.uid(),
      (SELECT requester_id FROM public.requests WHERE id = request_id)
    )
  );

COMMIT;
