/**
 * Flow 2 — Passenger offer flow
 *
 * Tests:
 *  - Passenger submits an offer on a driver ride
 *  - Driver sees the pending offer on their card
 *  - Driver accepts the offer inline
 *  - Accepted badge appears on the offer
 *  - seats_filled increments correctly
 */

import { test, expect, goToDashboard, goToMyRequests, requestCard, goToMyOffers, myOfferCard } from '../helpers/fixtures'
import { seedDriverRide, seedOffer, getUserId, driverCreds, pax1Creds, cleanupRunData } from '../helpers/db'

test.describe('Passenger offer flow', () => {
  test('pax submits offer → driver accepts → accepted badge + seats update', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Seed: a 2-seat ride
    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId,
      availableSeats: 2,
      budget: 30,
    })

    try {
      // ── Step 1: Passenger submits offer via UI ────────────────────────────
      await goToDashboard(pax1Page)

      // The new ride should appear in All Open tab
      const card = requestCard(pax1Page, requestId)
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Click the CTA (Request a seat)
      await card.locator('[data-testid="offer-cta-btn"]').click()

      // Modal opens
      await expect(pax1Page.getByRole('dialog')).toBeVisible()

      // Fill in a message and submit
      await pax1Page.getByRole('dialog').locator('textarea').fill('Need 1 seat please')
      await pax1Page.locator('[data-testid="offer-submit-btn"]').click()

      // Modal closes and toast appears
      await expect(pax1Page.getByText('Offer sent!')).toBeVisible({ timeout: 8_000 })

      // ── Step 2: Driver sees pending offer on their card ────────────────────
      await goToDashboard(driverPage)
      await goToMyRequests(driverPage)

      const driverCard = requestCard(driverPage, requestId)
      await expect(driverCard).toBeVisible({ timeout: 10_000 })

      // Pending offer count label
      await expect(driverCard.getByText(/1 pending offer/)).toBeVisible({ timeout: 8_000 })

      // ── Step 3: Driver accepts the inline offer ───────────────────────────
      await driverCard.locator('[data-testid="accept-inline-btn"]').first().click()

      // Accept button becomes loading and the offer row updates
      // After acceptance, the offer row should no longer show accept/decline
      await expect(driverCard.locator('[data-testid="accept-inline-btn"]')).not.toBeVisible({ timeout: 8_000 })

      // ── Step 4: Seats filled updates on the card ──────────────────────────
      // After accepting 1 of 2 seats, badge should show "1 of 2 seats left"
      await expect(driverCard.locator('[data-testid="seats-badge"]')).toContainText('1 of 2', { timeout: 8_000 })

      // ── Step 5: Passenger sees accepted badge in My Offers ─────────────────
      await goToDashboard(pax1Page)
      await goToMyOffers(pax1Page)

      // The offer card in My Offers tab should show accepted status
      const offerCard = pax1Page.locator('[data-testid="my-offer-card"][data-offer-status="accepted"]')
      await expect(offerCard.first()).toBeVisible({ timeout: 10_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })
})
