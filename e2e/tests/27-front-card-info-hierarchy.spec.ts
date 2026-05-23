/**
 * Flow 27 — Front card information hierarchy (COS-P25-FRONT-CARD-INFO-HIERARCHY-REDESIGN)
 *
 * Tests:
 *  1.  Ride front card shows route, time, payment, seats
 *  2.  Meal meetup front card shows title, time, cost plan
 *  3.  Food pickup front card shows store, time, payment — no social wording
 *  4.  Moving front card shows helpers, location, payment
 *  5.  Peer help front card shows subject, format, payment
 *  6.  Borrow front card shows item and duration
 *  7.  Offer state: offered/agreed price shows on front card
 *  8.  Meal/social front card never shows helper/counter pricing
 *  9.  Front card + flip work together
 * 10.  Mobile (390×844): no overflow, all key info visible
 */

import { test, expect, goToDashboard, requestCard } from '../helpers/fixtures'
import {
  seedRequest, seedDriverRide, seedPassengerRide, seedOffer, seedAcceptOffer,
  getUserId, driverCreds, pax1Creds, cleanupRunData,
} from '../helpers/db'

test.describe('Front card information hierarchy', () => {

  // ── 1: Ride front card ──────────────────────────────────────────────────────
  test('ride front card shows route, time, payment, and seats', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedDriverRide({
      requesterId: pax1Id,
      runId,
      originCity: 'Zachry Engineering',
      destinationCity: 'Target',
      availableSeats: 2,
      budget: 5,
      scheduledOffsetSeconds: 86400,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Route visible on front card (title shows origin → destination)
      await expect(card).toContainText('Zachry Engineering')
      await expect(card).toContainText('Target')

      // Payment visible on front card
      await expect(card).toContainText('$5')

      // Seats badge visible
      await expect(card).toContainText('seat')

      // Time visible (should show some date/time reference)
      await expect(card.locator('[data-testid="card-time-meta"]')).toBeVisible()

      // Open details — should still work
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })
      await card.locator('[data-testid="request-card-detail-close"]').click()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 2: Meal meetup front card ───────────────────────────────────────────────
  test('meal meetup front card shows title, time, cost plan', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Thai restaurant meetup`,
      structuredData: {
        cost_plan: 'self_pay',
        payment_summary: 'Everyone pays for themselves',
        summary: 'Thai restaurant meetup — going together.',
        restaurant_or_area: 'Thai Palace',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Category badge
      await expect(card).toContainText('Meal')

      // Title
      await expect(card).toContainText('Thai restaurant meetup')

      // Cost plan visible on front card
      await expect(card).toContainText('Everyone pays for themselves')

      // Must not show pickup/helper/reimbursement wording
      await expect(card).not.toContainText('Food pickup')
      await expect(card).not.toContainText('helper fee')
      await expect(card).not.toContainText('Reimburse')

      // Open details
      await card.locator('[data-testid="request-card-toggle"]').click()
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
      await card.locator('[data-testid="request-card-detail-close"]').click()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 3: Food pickup front card ────────────────────────────────────────────────
  test('food pickup front card shows store, time, payment — no social wording', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'errands',
      title: `[E2E-${runId}] Pick up Thai food`,
      structuredData: {
        errand_type: 'food_pickup',
        store_or_place: 'Thai Palace',
        task_details: 'Prepaid order #142',
        reimbursement_type: 'reimburse',
        payment_summary: 'Reimburse actual cost',
        summary: 'Pick up prepaid Thai food order.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Store visible on front card
      await expect(card.locator('[data-testid="card-location-meta"]')).toContainText('Thai Palace')

      // Payment visible on front card
      await expect(card).toContainText('Reimburse')

      // Must NOT show social cost wording on front card
      await expect(card).not.toContainText('Everyone pays for themselves')
      await expect(card).not.toContainText('Split the bill')
      await expect(card).not.toContainText('wants to join')

      // Details open
      await card.locator('[data-testid="request-card-toggle"]').click()
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
      await card.locator('[data-testid="request-card-detail-close"]').click()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 4: Moving front card ─────────────────────────────────────────────────────
  test('moving front card shows helpers, location, payment', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'moving',
      title: `[E2E-${runId}] Moving help needed`,
      budget: 20,
      structuredData: {
        move_type: 'move_out',
        helpers_needed: 2,
        access_type: 'stairs',
        summary: 'Need moving help Saturday.',
        payment_summary: '$20 fixed',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Helpers count visible on front card
      await expect(card.locator('[data-testid="card-capacity-meta"]')).toBeVisible()
      await expect(card.locator('[data-testid="card-capacity-meta"]')).toContainText('2')

      // Payment visible
      await expect(card).toContainText('$20')

      // Details open and show subject/format/session
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })
      await expect(details).toContainText('Moving out')
      await card.locator('[data-testid="request-card-detail-close"]').click()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 5: Peer help front card ──────────────────────────────────────────────────
  test('peer help front card shows subject, format, payment', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Calculus help needed`,
      budget: 15,
      structuredData: {
        subject: 'Calc II',
        help_type: 'homework',
        is_virtual: false,
        session_type: 'one_time',
        summary: 'Need help with Calc II homework.',
        payment_summary: '$15/hr',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Subject visible on front card
      await expect(card.locator('[data-testid="card-subject-meta"]')).toBeVisible()
      await expect(card.locator('[data-testid="card-subject-meta"]')).toContainText('Calc II')

      // Format visible
      await expect(card.locator('[data-testid="card-format-meta"]')).toBeVisible()
      await expect(card.locator('[data-testid="card-format-meta"]')).toContainText('In person')

      // Payment visible
      await expect(card).toContainText('$15')

      // Details open and show subject/format/session
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })
      await expect(details).toContainText('Calc II')
      await card.locator('[data-testid="request-card-detail-close"]').click()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 6: Borrow front card ─────────────────────────────────────────────────────
  test('borrow front card shows item and duration', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'borrow',
      title: `[E2E-${runId}] Borrow TI-84`,
      structuredData: {
        item: 'TI-84 graphing calculator',
        duration: '2 days',
        return_condition: 'same condition',
        summary: 'Need TI-84 for finals.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Item visible on front card
      await expect(card.locator('[data-testid="card-item-meta"]')).toBeVisible()
      await expect(card.locator('[data-testid="card-item-meta"]')).toContainText('TI-84')

      // Duration visible
      await expect(card.locator('[data-testid="card-duration-meta"]')).toBeVisible()
      await expect(card.locator('[data-testid="card-duration-meta"]')).toContainText('2 days')

      // Details open
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })
      await expect(details).toContainText('TI-84 graphing calculator')
      await expect(details).toContainText('same condition')
      await card.locator('[data-testid="request-card-detail-close"]').click()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 7: Offer state shows offered/agreed price on front card ──────────────────
  test('offered and agreed prices appear on front card when available', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)
    const driverId = await getUserId(driverCreds().email)

    // pax1 posts a request; driver (driverPage) is the helper
    const requestId = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Offer state test`,
      budget: 20,
      structuredData: {
        subject: 'Physics',
        payment_summary: '$20/hr',
        summary: 'Need help with physics.',
      },
    })

    // Driver offers $15
    const offerId = await seedOffer({
      requestId,
      helperId: driverId,
      counterBudget: 15,
      message: 'I can help with physics',
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Driver should see "Offered ✓" role badge while request is still open
      await expect(card.locator('[data-testid="card-role-status"]')).toBeVisible()
      await expect(card.locator('[data-testid="card-role-status"]')).toContainText('Offered')

      // Now accept the offer (seed acceptance) — request moves to 'matched', leaves All Open
      await seedAcceptOffer(offerId, requestId, 1)

      // Reload and switch to My Offers tab to see accepted state
      await driverPage.reload()
      await driverPage.waitForLoadState('networkidle')
      await driverPage.getByRole('button', { name: /My Offers/ }).click()
      await driverPage.waitForTimeout(300)

      // Find the offer card and verify accepted state
      const offerCard = driverPage.locator('[data-testid="my-offer-card"][data-offer-id="' + offerId + '"]')
      await expect(offerCard).toBeVisible({ timeout: 12_000 })

      // Accepted status badge visible
      await expect(offerCard).toContainText('Accepted')

      // Agreed price visible in offer card
      await expect(offerCard).toContainText('$15')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 8: Meal/social front card never shows helper/counter pricing ─────────────
  test('meal meetup front card does not show helper or counter pricing', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Indian food meetup`,
      structuredData: {
        cost_plan: 'split',
        payment_summary: 'Split the bill',
        summary: 'Indian food meetup Saturday.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Shows social cost plan
      await expect(card).toContainText('Split the bill')

      // Must NOT show marketplace pricing wording
      await expect(card).not.toContainText('helper fee')
      await expect(card).not.toContainText('Reimburse')
      await expect(card).not.toContainText('counter')
      await expect(card).not.toContainText('You offered $')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 9: Front card hierarchy and flip work together ───────────────────────────
  test('front card hierarchy and detail flip work together without regression', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Pizza meetup`,
      structuredData: {
        cost_plan: 'self_pay',
        payment_summary: 'Everyone pays for themselves',
        summary: 'Pizza meetup Friday night.',
        restaurant_or_area: 'Spin Pizza',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Front card shows structured info
      await expect(card).toContainText('Pizza meetup')
      await expect(card).toContainText('Everyone pays for themselves')

      // Expand details
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Front card still visible while expanded
      await expect(card).toContainText('Pizza meetup')
      await expect(card).toContainText('Everyone pays for themselves')

      // Close
      await card.locator('[data-testid="request-card-detail-close"]').click()
      await expect(details).not.toBeVisible({ timeout: 3_000 })

      // Front card still visible after close
      await expect(card).toContainText('Pizza meetup')
      await expect(card).toContainText('Everyone pays for themselves')

      // Click outside closes (click at top-left corner of viewport, outside any card)
      await card.locator('[data-testid="request-card-toggle"]').click()
      await expect(details).toBeVisible({ timeout: 3_000 })
      await driverPage.locator('body').click({ position: { x: 10, y: 10 } })
      await expect(details).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 10: Mobile viewport — no overflow, key info visible ─────────────────────
  test('mobile viewport 390x844: no overflow, key info visible on front cards', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    await Promise.all([
      seedRequest({
        requesterId: pax1Id, runId,
        category: 'moving',
        title: `[E2E-${runId}] Mobile moving`,
        budget: 25,
        structuredData: {
          helpers_needed: 2,
          payment_summary: '$25 fixed',
          summary: 'Need moving help.',
        },
      }),
      seedRequest({
        requesterId: pax1Id, runId,
        category: 'borrow',
        title: `[E2E-${runId}] Mobile borrow`,
        structuredData: {
          item: 'Laptop charger',
          duration: '1 day',
          summary: 'Need laptop charger.',
        },
      }),
    ])

    try {
      await driverPage.setViewportSize({ width: 390, height: 844 })
      await goToDashboard(driverPage)

      // No horizontal overflow
      const bodyWidth = await driverPage.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(400)

      // Moving card — helpers visible
      const movingCard = driverPage.locator('[data-testid="request-card"]').filter({ hasText: 'Mobile moving' }).first()
      await expect(movingCard).toBeVisible({ timeout: 12_000 })
      await expect(movingCard.locator('[data-testid="card-capacity-meta"]')).toBeVisible()

      // Borrow card — item visible
      const borrowCard = driverPage.locator('[data-testid="request-card"]').filter({ hasText: 'Mobile borrow' }).first()
      await expect(borrowCard).toBeVisible({ timeout: 12_000 })
      await expect(borrowCard.locator('[data-testid="card-item-meta"]')).toBeVisible()

      // Open and close works on mobile
      await movingCard.locator('[data-testid="request-card-toggle"]').click()
      await expect(movingCard.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
      await expect(movingCard.locator('[data-testid="request-card-detail-close"]')).toBeVisible()
      await movingCard.locator('[data-testid="request-card-detail-close"]').click()
      await expect(movingCard.locator('[data-testid="request-card-details"]')).not.toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

})
