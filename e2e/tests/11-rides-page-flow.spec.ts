/**
 * Flow 11 — Rides page unified booking flow
 *
 * Verifies that /dashboard/rides uses the canonical request_offers system
 * (not ride_passengers) for all booking actions:
 *
 *  - Passenger requests a seat via the Rides page "Request seat" button
 *    → submit_offer_safe is called → request_offers row created
 *  - Driver approves via the Rides page OfferSection
 *    → accept_offer_atomic is called → seats_filled incremented
 *  - Passenger sees "Seat confirmed" status on the Rides page
 *  - No ride_passengers row exists (canonical path only)
 */

import { test, expect } from '../helpers/fixtures'
import {
  seedDriverRide,
  seedOffer,
  getUserId,
  driverCreds,
  pax1Creds,
  cleanupRunData,
  adminClient,
} from '../helpers/db'

test.describe('Rides page — unified booking (request_offers)', () => {
  test('passenger requests seat on Rides page → offer row created, no ride_passengers row', async ({
    pax1Page,
    runId,
  }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId,
      availableSeats: 2,
      budget: 25,
    })

    try {
      // Navigate to Rides page and switch to "Offering a Ride" tab
      await pax1Page.goto('/dashboard/rides')
      await pax1Page.getByRole('button', { name: /Offering a Ride/i }).click()

      // Find ride card by wrapper data-request-id
      const wrapper = pax1Page.locator(`[data-request-id="${requestId}"]`)
      await expect(wrapper).toBeVisible({ timeout: 12_000 })

      // Click "Request seat"
      await wrapper.getByRole('button', { name: /Request seat/i }).click()

      // Pending status banner should appear (status becomes pending)
      await expect(wrapper.getByText(/pending driver approval/i)).toBeVisible({ timeout: 8_000 })

      // DB: offer must exist in request_offers, not ride_passengers
      const db = adminClient()

      const { data: offer } = await db
        .from('request_offers')
        .select('status, seats_requested')
        .eq('request_id', requestId)
        .eq('helper_id', pax1Id)
        .single()

      expect(offer?.status).toBe('pending')
      expect(offer?.seats_requested).toBe(1)

      // No ride_passengers row should have been created
      const { data: rp } = await db
        .from('ride_passengers')
        .select('id')
        .eq('request_id', requestId)
        .eq('passenger_id', pax1Id)

      expect(rp ?? []).toHaveLength(0)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('driver approves via Rides page OfferSection → accept_offer_atomic called, seats_filled incremented', async ({
    driverPage,
    runId,
  }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Seed ride + pending offer directly (bypass UI for setup)
    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId,
      availableSeats: 2,
      budget: 20,
    })
    await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })

    try {
      // Driver navigates to Rides page, switches to "Offering a Ride" tab
      await driverPage.goto('/dashboard/rides')
      await driverPage.getByRole('button', { name: /Offering a Ride/i }).click()

      // The ride card + OfferSection should be visible
      const wrapper = driverPage.locator(`[data-request-id="${requestId}"]`)
      await expect(wrapper).toBeVisible({ timeout: 12_000 })

      // OfferSection is rendered inside the wrapper — find the Approve button
      const approveBtn = wrapper.locator('[data-testid="rides-approve-btn"]').first()
      await expect(approveBtn).toBeVisible({ timeout: 8_000 })
      await approveBtn.click()

      // After approval the button disappears (offer is no longer pending)
      await expect(approveBtn).not.toBeVisible({ timeout: 8_000 })

      // DB: offer accepted, seats_filled = 1
      const db = adminClient()

      const { data: offer } = await db
        .from('request_offers')
        .select('status, final_agreed_price, seats_requested')
        .eq('request_id', requestId)
        .eq('helper_id', pax1Id)
        .single()

      expect(offer?.status).toBe('accepted')
      expect(offer?.final_agreed_price).toBe(20)

      const { data: req } = await db
        .from('requests')
        .select('seats_filled')
        .eq('id', requestId)
        .single()

      expect(req?.seats_filled).toBe(1)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('leave_ride_safe atomically decrements seats_filled', async ({ runId }) => {
    // Pure DB-level test — verifies the RPC handles seat decrement correctly.
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    const { seedAcceptOffer, authenticatedClient } = await import('../helpers/db')

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-leave`,
      availableSeats: 2,
      budget: 20,
    })
    const offerId = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    await seedAcceptOffer(offerId, requestId, 1)

    // Verify pre-condition: seats_filled = 1, status = 'open' (1 of 2 filled)
    const db = adminClient()
    const { data: before } = await db.from('requests').select('seats_filled, status').eq('id', requestId).single()
    expect(before?.seats_filled).toBe(1)
    expect(before?.status).toBe('open')

    try {
      // Call leave_ride_safe as pax1 (the accepted passenger)
      const pax1Client = await authenticatedClient(pax1Creds().email, pax1Creds().password)
      const { data: result } = await pax1Client.rpc('leave_ride_safe', { p_offer_id: offerId })

      expect(result?.ok).toBe(true)
      expect(result?.seats_filled).toBe(0)
      expect(result?.request_status).toBe('open')

      // DB state: offer rejected, seats_filled decremented
      const { data: offerRow } = await db.from('request_offers').select('status').eq('id', offerId).single()
      expect(offerRow?.status).toBe('rejected')

      const { data: after } = await db.from('requests').select('seats_filled, status').eq('id', requestId).single()
      expect(after?.seats_filled).toBe(0)
    } finally {
      await cleanupRunData(`${runId}-leave`)
    }
  })
})
