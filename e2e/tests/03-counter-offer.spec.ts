/**
 * Flow 3 — Counter-offer flow
 *
 * Tests:
 *  - Passenger submits offer at $20 on a $30 ride
 *  - Driver counters at $25
 *  - Passenger sees "Counter received" in My Offers
 *  - Passenger accepts the counter
 *  - final_agreed_price displayed as $25 on both sides
 */

import { test, expect, goToDashboard, goToMyRequests, requestCard, goToMyOffers } from '../helpers/fixtures'
import { seedDriverRide, seedOffer, getUserId, driverCreds, pax1Creds, cleanupRunData } from '../helpers/db'

test.describe('Counter-offer flow', () => {
  test('driver counters → passenger accepts → $25 shown as final price', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Seed: ride with $30 budget
    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId,
      availableSeats: 2,
      budget: 30,
    })

    // Seed: pax1's pending offer at $20
    await seedOffer({
      requestId,
      helperId: pax1Id,
      counterBudget: 20,
      seatsRequested: 1,
      message: 'Can you do $20?',
    })

    try {
      // ── Step 1: Driver sees offer and sends a counter ──────────────────────
      await goToDashboard(driverPage)
      await goToMyRequests(driverPage)

      const driverCard = requestCard(driverPage, requestId)
      await expect(driverCard).toBeVisible({ timeout: 10_000 })

      // Offer row should show "Can you do $20?" offer
      await expect(driverCard.locator('[data-testid="counter-inline-btn"]').first()).toBeVisible({ timeout: 8_000 })

      // Click Counter
      await driverCard.locator('[data-testid="counter-inline-btn"]').first().click()

      // Counter input appears
      const counterInput = driverCard.locator('[data-testid="counter-inline-input"]')
      await expect(counterInput).toBeVisible()
      await counterInput.fill('25')

      // Send counter
      await driverCard.locator('[data-testid="counter-inline-send"]').click()

      // Row updates to show "Counter sent ✓"
      await expect(driverCard.getByText('Counter sent ✓')).toBeVisible({ timeout: 8_000 })

      // ── Step 2: Passenger sees counter in My Offers ────────────────────────
      await goToDashboard(pax1Page)
      await goToMyOffers(pax1Page)

      const offerCard = pax1Page.locator('[data-testid="my-offer-card"][data-offer-status="countered"]')
      await expect(offerCard.first()).toBeVisible({ timeout: 10_000 })

      // The counter amount should be visible
      await expect(offerCard.first().getByText('$25')).toBeVisible()
      await expect(offerCard.first().locator('[data-testid="counter-label"]')).toContainText('Counter from driver')

      // ── Step 3: Passenger accepts the counter ─────────────────────────────
      await offerCard.first().locator('[data-testid="accept-counter-btn"]').click()

      // My Offers card should flip to accepted
      await expect(
        pax1Page.locator('[data-testid="my-offer-card"][data-offer-status="accepted"]')
      ).toBeVisible({ timeout: 10_000 })

      // ── Step 4: final_agreed_price of $25 visible ─────────────────────────
      const acceptedCard = pax1Page.locator('[data-testid="my-offer-card"][data-offer-status="accepted"]')
      await expect(acceptedCard.getByText(/\$25/)).toBeVisible()

      // Driver side: open the offers modal and verify accepted badge shows $25
      await goToDashboard(driverPage)
      await goToMyRequests(driverPage)

      const driverCardAfter = requestCard(driverPage, requestId)
      await expect(driverCardAfter).toBeVisible({ timeout: 10_000 })
      await driverCardAfter.locator('[data-testid="view-offers-btn"]').click()
      const modal = driverPage.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal.locator('[data-testid="offer-accepted-badge"]')).toContainText('$25', { timeout: 10_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })
})
