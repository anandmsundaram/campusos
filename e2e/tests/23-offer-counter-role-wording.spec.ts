/**
 * Flow 23 — Offer / counter / role wording
 *
 * Verifies that offer modal language, My Offers status labels, counter labels,
 * and action button visibility are subflow-aware and role-safe.
 *
 * Tests:
 *  1. Ride (passenger ride) offer modal: "Offer a ride" title + ride placeholder
 *  2. Meal meetup offer modal: "Express interest" title, no price input
 *  3. Food pickup offer modal: pickup-specific placeholder
 *  4. Moving offer modal: move-specific placeholder
 *  5. Peer help offer modal: tutoring-specific placeholder
 *  6. Meal meetup: no counter button in inline offer row (requester view)
 *  7. Ride counter label: "Counter from passenger" in helper's My Offers tab
 */

import { test, expect, goToDashboard, goToMyRequests, goToMyOffers, requestCard, myOfferCard } from '../helpers/fixtures'
import { seedRequest, seedPassengerRide, seedOffer, seedCounterOffer, getUserId, driverCreds, pax1Creds, cleanupRunData } from '../helpers/db'

test.describe('Offer / counter / role wording', () => {

  // ── 1: Ride offer modal ────────────────────────────────────────────────────
  test('ride (passenger): offer modal title "Offer a ride" + ride-specific placeholder', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    // pax1 needs a ride (is_driver=false)
    const requestId = await seedPassengerRide({ requesterId: pax1Id, runId })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // CTA button opens the offer modal
      await card.locator('[data-testid="offer-cta-btn"]').click()
      const dialog = driverPage.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // Modal title should say "Offer a ride", not "Offer to help"
      await expect(dialog.getByRole('heading', { name: 'Offer a ride' })).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Offer to help' })).not.toBeVisible()

      // Placeholder text should reference driving / car
      const textarea = dialog.locator('textarea')
      const placeholder = await textarea.getAttribute('placeholder')
      expect(placeholder).toMatch(/car|pick you up/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 2: Meal meetup offer modal ─────────────────────────────────────────────
  test('meal meetup: offer modal title "Express interest", no price input', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Thai food meetup`,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      await card.locator('[data-testid="offer-cta-btn"]').click()
      const dialog = driverPage.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // Title: "Express interest" — not "Offer to help"
      await expect(dialog.getByRole('heading', { name: 'Express interest' })).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'Offer to help' })).not.toBeVisible()

      // Placeholder should reference joining / interest
      const textarea = dialog.locator('textarea')
      const placeholder = await textarea.getAttribute('placeholder')
      expect(placeholder).toMatch(/join|free/i)

      // No price input for meal meetup
      await expect(dialog.locator('[data-testid="offer-price-input"]')).not.toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 3: Food pickup offer modal ─────────────────────────────────────────────
  test('food pickup errand: offer modal placeholder mentions "pick"', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'errands',
      title: `[E2E-${runId}] Pick up Chipotle order`,
      structuredData: { errand_type: 'food_pickup', store_or_place: 'Chipotle' },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      await card.locator('[data-testid="offer-cta-btn"]').click()
      const dialog = driverPage.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const textarea = dialog.locator('textarea')
      const placeholder = await textarea.getAttribute('placeholder')
      expect(placeholder).toMatch(/pick/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 4: Moving offer modal ──────────────────────────────────────────────────
  test('moving request: offer modal placeholder mentions truck or move', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'moving',
      title: `[E2E-${runId}] Help me move apartments`,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      await card.locator('[data-testid="offer-cta-btn"]').click()
      const dialog = driverPage.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const textarea = dialog.locator('textarea')
      const placeholder = await textarea.getAttribute('placeholder')
      expect(placeholder).toMatch(/truck|free|move|saturday/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 5: Peer help offer modal ───────────────────────────────────────────────
  test('peer help request: offer modal placeholder mentions course or help', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Need calc tutoring`,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      await card.locator('[data-testid="offer-cta-btn"]').click()
      const dialog = driverPage.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const textarea = dialog.locator('textarea')
      const placeholder = await textarea.getAttribute('placeholder')
      expect(placeholder).toMatch(/course|help|meet/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 6: Meal meetup — no counter button in requester's inline offer row ────
  test('meal meetup: no counter button shown to requester for pending offer', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)
    const driverId = await getUserId(driverCreds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Sushi dinner meetup`,
    })
    await seedOffer({ requestId, helperId: driverId })

    try {
      // pax1 (requester) sees inline offer row in My Requests tab
      await goToDashboard(pax1Page)
      await goToMyRequests(pax1Page)

      const card = requestCard(pax1Page, requestId)
      await expect(card).toBeVisible({ timeout: 10_000 })
      await expect(card.getByText(/1 pending offer/)).toBeVisible({ timeout: 8_000 })

      // Counter button must NOT appear for meal_meetup
      await expect(card.locator('[data-testid="counter-inline-btn"]')).not.toBeVisible()

      // Accept and Decline buttons DO appear (pax1 can still accept/decline)
      await expect(card.locator('[data-testid="accept-inline-btn"]')).toBeVisible()
      await expect(card.locator('[data-testid="decline-inline-btn"]')).toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 7: Ride counter label: "Counter from passenger" in helper's My Offers ──
  test('ride (passenger): counter label shows "Counter from passenger" in My Offers', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)
    const driverId = await getUserId(driverCreds().email)

    // pax1 is a passenger needing a ride; driver offers
    const requestId = await seedPassengerRide({ requesterId: pax1Id, runId })
    const offerId = await seedOffer({ requestId, helperId: driverId, counterBudget: 15 })

    // pax1 counters the driver's offer at $18
    await seedCounterOffer(offerId, 18)

    try {
      // Driver (helper) views My Offers tab
      await goToDashboard(driverPage)
      await goToMyOffers(driverPage)

      const card = myOfferCard(driverPage, offerId)
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Counter label should say "Counter from passenger" (ride, is_driver=false)
      const counterLabel = card.locator('[data-testid="counter-label"]')
      await expect(counterLabel).toBeVisible({ timeout: 8_000 })
      await expect(counterLabel).toContainText('Counter from passenger')

      // Counter amount $18 should be visible
      await expect(card).toContainText('$18')

      // Accept / Decline counter buttons appear
      await expect(card.locator('[data-testid="accept-counter-btn"]')).toBeVisible()
      await expect(card.locator('[data-testid="decline-counter-btn"]')).toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

})
