-- Unify ride-booking: make request_offers the single canonical transactional system.
--
-- Background
-- ----------
-- Two parallel booking paths previously existed:
--   1. Dashboard → request_offers (offer/counter/accept, atomic stored procs, finance tracking)
--   2. Rides page → ride_passengers (direct INSERT/UPDATE, no stored procs, no counter-offer)
--
-- This migration removes the dual-path problem by:
--   (a) Updating ride_messages RLS to recognise accepted request_offers in addition to
--       confirmed ride_passengers entries (backward compat for historical rows).
--   (b) The ride_passengers table is preserved as-is (no DROP) so existing confirmed
--       rows remain visible to historical RLS checks and audit trails.
--
-- After this migration, all new ride seat interactions go through:
--   submit_offer_safe() → accept_offer_atomic() → (complete/cancel)_request_safe()
--
-- Client changes (rides/page.tsx, dashboard/page.tsx, requests/page.tsx, offers/page.tsx)
-- are shipped alongside this migration.
--
-- ROLLBACK
-- --------
-- To revert: restore the two original ride_messages policies from migration 006:
--
--   DROP POLICY IF EXISTS "ride_messages: driver or accepted passenger can view"   ON public.ride_messages;
--   DROP POLICY IF EXISTS "ride_messages: driver or accepted passenger can insert" ON public.ride_messages;
--
--   CREATE POLICY "ride_messages: driver or confirmed passenger can view"
--     ON public.ride_messages FOR SELECT TO authenticated
--     USING (
--       auth.uid() = (SELECT requester_id FROM public.requests WHERE id = request_id)
--       OR auth.uid() IN (
--         SELECT passenger_id FROM public.ride_passengers
--         WHERE request_id = ride_messages.request_id AND status = 'confirmed'
--       )
--     );
--
--   CREATE POLICY "ride_messages: driver or confirmed passenger can insert"
--     ON public.ride_messages FOR INSERT TO authenticated
--     WITH CHECK (
--       auth.uid() = (SELECT requester_id FROM public.requests WHERE id = request_id)
--       OR auth.uid() IN (
--         SELECT passenger_id FROM public.ride_passengers
--         WHERE request_id = ride_messages.request_id AND status = 'confirmed'
--       )
--     );
--
-- Then redeploy client code from the previous commit.


-- ─── ride_messages RLS — unified access ───────────────────────────────────────
-- Passengers may access group chat if they have:
--   (a) a confirmed ride_passengers row  [historical bookings]
--   (b) an accepted request_offers row   [new canonical bookings]
--
-- The driver (requester) retains access unconditionally.

DROP POLICY IF EXISTS "ride_messages: driver or confirmed passenger can view"   ON public.ride_messages;
DROP POLICY IF EXISTS "ride_messages: driver or confirmed passenger can insert" ON public.ride_messages;

-- Also drop new-name versions in case of re-run
DROP POLICY IF EXISTS "ride_messages: driver or accepted passenger can view"   ON public.ride_messages;
DROP POLICY IF EXISTS "ride_messages: driver or accepted passenger can insert" ON public.ride_messages;

CREATE POLICY "ride_messages: driver or accepted passenger can view"
  ON public.ride_messages FOR SELECT TO authenticated
  USING (
    -- driver
    auth.uid() = (SELECT requester_id FROM public.requests WHERE id = request_id)
    -- historical confirmed passenger (ride_passengers path)
    OR auth.uid() IN (
      SELECT passenger_id FROM public.ride_passengers
      WHERE request_id = ride_messages.request_id AND status = 'confirmed'
    )
    -- new canonical accepted offer (request_offers path)
    OR auth.uid() IN (
      SELECT helper_id FROM public.request_offers
      WHERE request_id = ride_messages.request_id AND status = 'accepted'
    )
  );

CREATE POLICY "ride_messages: driver or accepted passenger can insert"
  ON public.ride_messages FOR INSERT TO authenticated
  WITH CHECK (
    -- driver
    auth.uid() = (SELECT requester_id FROM public.requests WHERE id = request_id)
    -- historical confirmed passenger
    OR auth.uid() IN (
      SELECT passenger_id FROM public.ride_passengers
      WHERE request_id = ride_messages.request_id AND status = 'confirmed'
    )
    -- new canonical accepted offer
    OR auth.uid() IN (
      SELECT helper_id FROM public.request_offers
      WHERE request_id = ride_messages.request_id AND status = 'accepted'
    )
  );


-- ─── MANUAL QA CHECKLIST ─────────────────────────────────────────────────────
-- 1. Verify policies exist after migration:
--    SELECT policyname FROM pg_policies
--    WHERE tablename = 'ride_messages';
--    Expected: "ride_messages: driver or accepted passenger can view"
--              "ride_messages: driver or accepted passenger can insert"
--
-- 2. New booking flow (no ride_passengers row):
--    As passenger, submit an offer via Rides page → offer appears in request_offers.
--    Driver accepts via Rides page → accept_offer_atomic() called.
--    Passenger opens Group Chat → can send/receive messages (request_offers check fires).
--
-- 3. Historical booking backward compat:
--    Manually confirm a ride_passengers row (status='confirmed') for a user.
--    That user should still be able to access ride_messages (ride_passengers check fires).
--
-- 4. Unauthorized user blocked:
--    A user with NO ride_passengers and NO accepted request_offers for a ride
--    should receive an RLS error when trying to insert into ride_messages.
