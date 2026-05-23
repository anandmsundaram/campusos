/**
 * Flow 26 — Card flip / UX refinement (COS-P25-CARD-FLIP-UX-REFINEMENT)
 *
 * Tests:
 *  1.  Only one card open at a time — opening second closes first
 *  2.  Click outside open card closes it; front card remains visible
 *  3.  Clicking inside detail panel does not close card
 *  4.  CTA click does not accidentally toggle details
 *  5.  Meal & Social front card uses structured title/time/cost — not raw text
 *  6.  Food pickup front card does not show social cost wording
 *  7.  Moving front card shows helpers/time/payment key work details
 *  8.  Peer help front card shows subject/time/payment
 *  9.  Borrow front card and details show item/duration/return
 * 10.  Keyboard accessibility: aria-expanded + Space/Enter toggle
 * 11.  Mobile layout — no horizontal overflow, close button visible
 * 12.  Reload persistence — front card and details survive page refresh
 */

import { test, expect, goToDashboard, goToMyRequests, requestCard } from '../helpers/fixtures'
import { seedRequest, getUserId, driverCreds, pax1Creds, cleanupRunData } from '../helpers/db'


test.describe('Card flip UX refinement', () => {

  // ── 1: Only one card open at a time ─────────────────────────────────────────
  test('opening second card closes first card', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const idA = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Thai meetup A`,
      structuredData: { summary: 'Thai meetup A' },
    })
    const idB = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'moving',
      title: `[E2E-${runId}] Moving help B`,
      structuredData: { move_type: 'move_out', helpers_needed: 2 },
    })

    try {
      await goToDashboard(driverPage)

      const cardA = requestCard(driverPage, idA)
      const cardB = requestCard(driverPage, idB)
      await expect(cardA).toBeVisible({ timeout: 12_000 })
      await expect(cardB).toBeVisible({ timeout: 12_000 })

      // Open card A
      await cardA.locator('[data-testid="request-card-toggle"]').click()
      await expect(cardA.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
      await expect(cardA.locator('[data-testid="request-card-toggle"]')).toHaveAttribute('aria-expanded', 'true')

      // Open card B — card A should close
      await cardB.locator('[data-testid="request-card-toggle"]').click()
      await expect(cardB.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
      await expect(cardA.locator('[data-testid="request-card-details"]')).not.toBeVisible({ timeout: 3_000 })
      await expect(cardA.locator('[data-testid="request-card-toggle"]')).toHaveAttribute('aria-expanded', 'false')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 2: Click outside closes the open card ───────────────────────────────────
  test('click outside open card closes it; front card content remains', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'borrow',
      title: `[E2E-${runId}] Borrow calculator`,
      structuredData: { item: 'calculator', duration: '2 days' },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Open card
      await card.locator('[data-testid="request-card-toggle"]').click()
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })

      // Click outside the card — use the page heading or filter area
      await driverPage.locator('body').click({ position: { x: 10, y: 10 } })

      // Card should close
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible({ timeout: 3_000 })

      // Front card content still visible
      await expect(card).toBeVisible()
      await expect(card).toContainText(`[E2E-${runId}]`)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 3: Clicking inside detail panel does not close card ─────────────────────
  test('clicking inside details area does not close the card', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Peer help inner click`,
      structuredData: {
        subject: 'Physics',
        help_type: 'homework',
        is_virtual: 'true',
        summary: 'Need help with physics.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Open card
      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await toggle.click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Click inside the details panel — click on visible text
      await details.click({ position: { x: 10, y: 10 } })

      // Details must still be visible
      await expect(details).toBeVisible()

      // Close via close button
      await card.locator('[data-testid="request-card-detail-close"]').click()
      await expect(details).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 4: CTA click does not accidentally toggle details ───────────────────────
  test('offer-cta-btn click does not toggle card details', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'moving',
      title: `[E2E-${runId}] CTA safety moving`,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Card starts collapsed
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Click CTA — should open modal, NOT expand the card
      await card.locator('[data-testid="offer-cta-btn"]').click()
      const dialog = driverPage.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Card must remain collapsed
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      await driverPage.keyboard.press('Escape')
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 5: Meal & Social front card uses structured title/time/cost ─────────────
  test('meal meetup front card shows structured title/time/cost, not raw text only', async ({
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
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Front card should show structured content
      await expect(card).toContainText('Thai restaurant meetup')
      await expect(card).toContainText('Everyone pays for themselves')

      // Must NOT show misleading wording
      await expect(card).not.toContainText('Thai food pickup')
      await expect(card).not.toContainText('Unclear request')

      // Open details
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Details show payment
      await expect(details).toContainText('Everyone pays for themselves')

      // Close
      await card.locator('[data-testid="request-card-detail-close"]').click()
      await expect(details).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 6: Food pickup front card shows no social cost wording ─────────────────
  test('food pickup front card does not show social cost wording', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'errands',
      title: `[E2E-${runId}] Pick up Thai food order`,
      structuredData: {
        errand_type: 'food_pickup',
        store_or_place: 'Thai Palace',
        task_details: 'prepaid order, no. 142',
        reimbursement_type: 'reimburse',
        payment_summary: 'Reimburse actual cost',
        summary: 'Pick up prepaid Thai food order.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Must NOT show social cost wording
      await expect(card).not.toContainText('Everyone pays for themselves')
      await expect(card).not.toContainText('Split the bill')
      await expect(card).not.toContainText('wants to join')

      // Open details
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })
      await expect(details).not.toContainText('Everyone pays for themselves')

      await card.locator('[data-testid="request-card-detail-close"]').click()
      await expect(details).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 7: Moving front card shows helpers/payment key work details ─────────────
  test('moving front card shows move type, helpers, and payment', async ({
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

      // Front card shows payment (from budget)
      await expect(card).toContainText('$20')

      // Front should not be dominated by raw text only — badge and structured summary present
      await expect(card.locator('[data-testid="request-card-key-details"]')).toBeVisible()

      // Open details
      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await toggle.click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Moving-specific structured fields
      await expect(details).toContainText('Moving out')
      await expect(details).toContainText('2 needed')
      await expect(details).toContainText('Stairs only')

      await card.locator('[data-testid="request-card-detail-close"]').click()
      await expect(details).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 8: Peer help front card shows subject/time/payment ──────────────────────
  test('peer help front card shows subject, time, payment key details', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Calc II help`,
      budget: 15,
      structuredData: {
        subject: 'Calc II',
        help_type: 'homework',
        is_virtual: 'false',
        session_type: 'one_time',
        summary: 'Calculus help tonight at 8 PM.',
        payment_summary: '$15/hr',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Front card shows budget
      await expect(card).toContainText('$15')
      // Key details meta area visible
      await expect(card.locator('[data-testid="request-card-key-details"]')).toBeVisible()

      // Open details
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      await expect(details).toContainText('Calc II')
      await expect(details).toContainText('Homework help')
      await expect(details).toContainText('In-person')
      await expect(details).toContainText('One-time')

      await card.locator('[data-testid="request-card-detail-close"]').click()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 9: Borrow front card and details show item/duration/return ──────────────
  test('borrow front card and details show item, duration, return', async ({
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
        summary: 'Need TI-84 for 2 days.',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Front card visible with title
      await expect(card).toContainText(`[E2E-${runId}]`)

      // Open details
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      await expect(details).toContainText('TI-84 graphing calculator')
      await expect(details).toContainText('2 days')
      await expect(details).toContainText('same condition')

      await card.locator('[data-testid="request-card-detail-close"]').click()
      await expect(details).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 10: Keyboard accessibility — aria-expanded + Space/Enter ────────────────
  test('toggle has aria-expanded and responds to Space and Enter', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'borrow',
      title: `[E2E-${runId}] Keyboard access test`,
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      const toggle = card.locator('[data-testid="request-card-toggle"]')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')

      // Click to expand
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })

      // Space to collapse
      await toggle.focus()
      await driverPage.keyboard.press('Space')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(card.locator('[data-testid="request-card-details"]')).not.toBeVisible()

      // Enter to expand again
      await toggle.focus()
      await driverPage.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 11: Mobile layout — no horizontal overflow, close button visible ─────────
  test('mobile viewport: no horizontal overflow, close button visible', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Mobile layout check`,
      structuredData: {
        cuisine_preference: 'Sushi',
        meal_type: 'dinner',
        group_size: 3,
        summary: 'Sushi dinner meetup.',
      },
    })

    try {
      await driverPage.setViewportSize({ width: 390, height: 844 })
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Open details on mobile
      await card.locator('[data-testid="request-card-toggle"]').click()
      const details = card.locator('[data-testid="request-card-details"]')
      await expect(details).toBeVisible({ timeout: 3_000 })

      // Close button visible
      const closeBtn = card.locator('[data-testid="request-card-detail-close"]')
      await expect(closeBtn).toBeVisible()

      // Verify no horizontal scroll: document width should equal viewport width
      const docWidth = await driverPage.evaluate(() => document.documentElement.scrollWidth)
      const viewportWidth = 390
      expect(docWidth).toBeLessThanOrEqual(viewportWidth + 5) // allow 5px tolerance

      // Close
      await closeBtn.click()
      await expect(details).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 12: Reload persistence — front card and details survive page refresh ─────
  test('card content persists after page reload', async ({
    driverPage,
    pax1Page,
    runId,
  }) => {
    const pax1Id = await getUserId(pax1Creds().email)

    const id = await seedRequest({
      requesterId: pax1Id, runId,
      category: 'meal_meetup',
      title: `[E2E-${runId}] Persistence test`,
      budget: null,
      structuredData: {
        cuisine_preference: 'Thai',
        meal_type: 'lunch',
        summary: 'Thai lunch meetup.',
        payment_summary: 'Everyone pays for themselves',
        cost_plan: 'self_pay',
      },
    })

    try {
      await goToDashboard(driverPage)
      const card = requestCard(driverPage, id)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Verify front card before reload
      await expect(card).toContainText(`[E2E-${runId}]`)

      // Open details before reload
      await card.locator('[data-testid="request-card-toggle"]').click()
      await expect(card.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
      await expect(card.locator('[data-testid="request-card-details"]')).toContainText('Thai')

      // Reload the page
      await driverPage.reload()
      await driverPage.waitForLoadState('networkidle')

      // After reload: card is still visible but detail state resets (correct — client state)
      const cardAfter = requestCard(driverPage, id)
      await expect(cardAfter).toBeVisible({ timeout: 12_000 })
      await expect(cardAfter).toContainText(`[E2E-${runId}]`)

      // Can re-open details after reload
      await cardAfter.locator('[data-testid="request-card-toggle"]').click()
      await expect(cardAfter.locator('[data-testid="request-card-details"]')).toBeVisible({ timeout: 3_000 })
      await expect(cardAfter.locator('[data-testid="request-card-details"]')).toContainText('Thai')
    } finally {
      await cleanupRunData(runId)
    }
  })

})
