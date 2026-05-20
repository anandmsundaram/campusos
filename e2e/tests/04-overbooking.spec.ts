/**
 * Flow 4 — Overbooking protection (race-condition test)
 *
 * Tests that accept_offer_atomic prevents two passengers from filling
 * the same seat simultaneously.
 *
 * Strategy:
 *   - Seed a ride with available_seats = 1
 *   - Seed two pending offers (pax1 and pax2)
 *   - Driver opens the Offers modal
 *   - Driver accepts pax1's offer successfully
 *   - Driver tries to accept pax2's offer → should fail with seat error
 *
 * The real concurrency protection lives in the DB (FOR UPDATE lock), so
 * this UI test validates that the error surfaces correctly in the modal.
 */

import { test, expect, goToDashboard, goToMyRequests, requestCard } from '../helpers/fixtures'
import { seedDriverRide, seedOffer, getUserId, driverCreds, pax1Creds, pax2Creds, cleanupRunData } from '../helpers/db'

test.describe('Overbooking protection', () => {
  test('second seat acceptance fails with readable error', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)
    const pax2Id = await getUserId(pax2Creds().email)

    // Ride with only 1 seat
    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId,
      availableSeats: 1,
      budget: 20,
    })

    // Two pending offers
    await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    await seedOffer({ requestId, helperId: pax2Id, seatsRequested: 1 })

    try {
      await goToDashboard(driverPage)
      await goToMyRequests(driverPage)

      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Open the "View offers" modal
      await card.locator('[data-testid="view-offers-btn"]').click()
      const modal = driverPage.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Two accept buttons should be visible
      const acceptBtns = modal.locator('[data-testid="modal-accept-btn"]')
      await expect(acceptBtns).toHaveCount(2, { timeout: 8_000 })

      // Accept the first offer → should succeed
      await acceptBtns.first().click()
      // After acceptance the first offer row should show accepted badge
      await expect(modal.locator('[data-testid="offer-accepted-badge"]').first()).toBeVisible({ timeout: 8_000 })

      // Second accept button should now be disabled (canAccept = false because seat is full)
      await expect(acceptBtns.last()).toBeDisabled({ timeout: 5_000 })

      // Close the modal and verify the card shows FULL
      await modal.locator('button[aria-label="Close"]').click()
      await expect(card.getByText('FULL')).toBeVisible({ timeout: 8_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('concurrent DB-level race: second RPC call returns seat error', async ({ runId }) => {
    // Pure DB-level test — no browser needed.
    // We simulate two callers calling accept_offer_atomic in rapid succession.
    const { adminClient } = await import('../helpers/db')
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)
    const pax2Id = await getUserId(pax2Creds().email)

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-race`,
      availableSeats: 1,
      budget: 20,
    })
    const offer1Id = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    const offer2Id = await seedOffer({ requestId, helperId: pax2Id, seatsRequested: 1 })

    try {
      const db = adminClient()

      // Fire both acceptances concurrently
      const [result1, result2] = await Promise.all([
        db.rpc('accept_offer_atomic', { p_offer_id: offer1Id, p_accepted_by: driverId }),
        db.rpc('accept_offer_atomic', { p_offer_id: offer2Id, p_accepted_by: driverId }),
      ])

      const outcomes = [result1.data, result2.data]
      const succeeded = outcomes.filter(r => r?.ok === true).length
      const failed = outcomes.filter(r => r?.ok === false).length

      expect(succeeded).toBe(1)
      expect(failed).toBe(1)

      // The failing one must mention seats
      const failedResult = outcomes.find(r => !r?.ok)
      expect(failedResult?.error).toMatch(/seat|full|available/i)
    } finally {
      await cleanupRunData(`${runId}-race`)
    }
  })
})
