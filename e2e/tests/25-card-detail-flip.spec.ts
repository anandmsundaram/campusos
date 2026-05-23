/**
 * Flow 25 — Card detail expand/collapse (COS-P25-CARD-DETAIL-FLIP)
 *
 * Tests:
 *  1. Meal meetup: expand shows detail panel with meal-specific fields
 *  2. Food pickup errand: expand shows store + task details
 *  3. CTA safety: clicking offer-cta-btn does NOT expand the card
 *  4. Moving: expand shows move type, helpers, access type
 *  5. Peer help: expand shows subject, format, mode
 *  6. Borrow: expand shows item + duration
 *  7. Keyboard/accessibility: aria-expanded reflects state; Space/Enter toggle
 *  8. No regression: front card content remains visible during expand/collapse
 */

import { test, expect, goToDashboard, goToMyRequests, requestCard } from '../helpers/fixtures'
import { seedRequest, getUserId, driverCreds, pax1Creds, cleanupRunData } from '../helpers/db'

test.describe('Card detail expand / collapse', () => {

  // ── 1: Meal meetup detail panel ──────────────────────────────────────────────
  test('meal meetup: expand reveals detail panel with cuisine and meal type', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Thai dinner meetup`,
      structuredData: {
        cuisine_preference: 'Thai',
        meal_type: 'dinner',
        group_size: 4,
        summary: 'Looking for dinner companions for Thai food.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Detail panel not visible before expand
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Toggle expands the card
      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await expect(toggle).toBeVisible()
      await toggle.click()

      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Meal-specific fields rendered
      await expect(details).toContainText('Thai')
      await expect(details).toContainText('Dinner')

      // Close button collapses the panel
      const closeBtn = card.locator('[data-testid="request-card-detail-close"]')
      await expect(closeBtn).toBeVisible()
      await closeBtn.click()
      await expect(details).not.toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 2: Food pickup errand ────────────────────────────────────────────────────
  test('food pickup errand: expand shows store and task details', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'errands',
      title: `[E2E-${runId}] Pick up Chipotle`,
      structuredData: {
        errand_type: 'food_pickup',
        store_or_place: 'Chipotle',
        task_details: 'chicken burrito bowl, no cilantro',
        reimbursement_type: 'paid',
        summary: 'Need someone to pick up Chipotle order.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await toggle.click()

      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Errand type, store, and task details should appear
      await expect(details).toContainText('Food pickup')
      await expect(details).toContainText('Chipotle')
      await expect(details).toContainText('chicken burrito bowl')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 3: CTA click does NOT expand the card ────────────────────────────────────
  test('clicking offer-cta-btn does not expand the card', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Need calc help`,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Card starts collapsed
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Click the primary CTA
      const ctaBtn = card.locator('[data-testid="offer-cta-btn"]')
      await expect(ctaBtn).toBeVisible()
      await ctaBtn.click()

      // Offer modal opens
      const dialog = driverPage.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Card is still NOT expanded — CTA click did not trigger expand
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Dismiss the dialog
      await driverPage.keyboard.press('Escape')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 4: Moving detail shows move type, helpers, access ────────────────────────
  test('moving: expand shows move type, helpers needed, and access type', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'moving',
      title: `[E2E-${runId}] Moving apartments`,
      structuredData: {
        move_type: 'move_out',
        helpers_needed: 3,
        access_type: 'stairs',
        has_heavy_items: true,
        summary: 'Need help moving out of apartment.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await toggle.click()

      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Moving-specific fields
      await expect(details).toContainText('Moving out')
      await expect(details).toContainText('3 needed')
      await expect(details).toContainText('Stairs only')
      await expect(details).toContainText('heavy items')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 5: Peer help detail shows subject, format, mode ──────────────────────────
  test('peer help: expand shows subject, format, and session mode', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Calc II tutoring`,
      structuredData: {
        subject: 'Calc II',
        help_type: 'homework',
        is_virtual: 'false',
        session_type: 'one_time',
        summary: 'Need help with Calc II homework.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await toggle.click()

      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Peer help fields
      await expect(details).toContainText('Calc II')
      await expect(details).toContainText('Homework help')
      await expect(details).toContainText('In-person')
      await expect(details).toContainText('One-time')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 6: Borrow detail shows item and duration ──────────────────────────────────
  test('borrow: expand shows item and duration', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'borrow',
      title: `[E2E-${runId}] Borrow a graphing calculator`,
      structuredData: {
        item: 'TI-84 graphing calculator',
        duration: 'finals week',
        return_condition: 'same condition',
        summary: 'Need to borrow a graphing calculator for finals.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await toggle.click()

      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Borrow-specific fields
      await expect(details).toContainText('TI-84 graphing calculator')
      await expect(details).toContainText('finals week')
      await expect(details).toContainText('same condition')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 7: Keyboard accessibility — aria-expanded + Space/Enter ──────────────────
  test('toggle button has aria-expanded and responds to keyboard', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'borrow',
      title: `[E2E-${runId}] Keyboard accessibility test`,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await expect(toggle).toBeVisible()

      // Initially collapsed
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Click to expand
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })

      // Keyboard: Space toggles back to collapsed
      await toggle.focus()
      await driverPage.keyboard.press('Space')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Keyboard: Enter expands again
      await toggle.focus()
      await driverPage.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 8: No regression — front card content visible through expand/collapse ─────
  test('front card content remains visible during expand and after collapse', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Front card regression check`,
      structuredData: {
        subject: 'Physics',
        summary: 'Need help with physics problem sets.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Title visible before expand
      await expect(card).toContainText(`[E2E-${runId}]`)

      // Offer CTA visible before expand
      await expect(card.locator('[data-testid="offer-cta-btn"]')).toBeVisible()

      // Expand
      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await toggle.click()
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })

      // Title still visible while expanded
      await expect(card).toContainText(`[E2E-${runId}]`)

      // Offer CTA still visible while expanded (in card footer)
      await expect(card.locator('[data-testid="offer-cta-btn"]')).toBeVisible()

      // Collapse
      await toggle.click()
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Title and CTA still visible after collapse
      await expect(card).toContainText(`[E2E-${runId}]`)
      await expect(card.locator('[data-testid="offer-cta-btn"]')).toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

})
