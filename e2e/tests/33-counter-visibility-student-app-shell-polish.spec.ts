/**
 * Spec 33 — Counter visibility and student app shell polish
 *
 * Verifies that each party in the counter-offer flow sees exactly the right
 * CTAs and status labels, that unrelated users cannot see private counter
 * controls, and that the app shell is not cluttered with duplicate actions.
 *
 * User roles:
 *  driver  = requester (creates the request, counters pax1's offer)
 *  pax1    = helper (submits offer, responds to requester's counter)
 *  pax2    = unrelated same-campus user (should not see private CTAs)
 *
 * Tests:
 *  1.  Requester sees needs-action-banner when a new offer is pending
 *  2.  Helper sees needs-action-banner after requester counters their offer
 *  3.  Requester does NOT see needs-action-banner after they countered (waiting)
 *  4.  Helper's My Offers tab shows counter-label + accept/decline CTAs
 *  5.  Requester's My Requests view shows counter-sent-status (waiting state)
 *  6.  Standalone /dashboard/offers page shows accept/decline counter buttons
 *  7.  Unrelated same-campus user has no private counter CTAs on their dashboard
 *  8.  Cross-campus user does not see the request in their feed
 *  9.  Sidebar does not contain a request-posting textarea (no duplication)
 * 10.  Request-posting textarea is present in main content area
 * 11.  Accepting a counter on /dashboard/offers removes the counter CTA
 */

import { test, expect } from '../helpers/fixtures'
import {
  getUserId,
  driverCreds,
  pax1Creds,
  pax2Creds,
  seedRequest,
  seedOffer,
  seedCounterOffer,
  seedTourCompleted,
  seedTermsAcceptance,
  getCampusId,
  setUserCampus,
  cleanupRunData,
} from '../helpers/db'

test.describe('Counter visibility and student app shell polish', () => {
  let driverUserId: string
  let pax1UserId: string
  let pax2UserId: string
  let tamuCampusId: string
  let utAustinCampusId: string

  test.beforeAll(async () => {
    ;[driverUserId, pax1UserId, pax2UserId, tamuCampusId, utAustinCampusId] = await Promise.all([
      getUserId(driverCreds().email),
      getUserId(pax1Creds().email),
      getUserId(pax2Creds().email),
      getCampusId('tamu'),
      getCampusId('ut-austin'),
    ])
  })

  test.beforeEach(async () => {
    await Promise.all([
      setUserCampus(driverUserId, tamuCampusId),
      setUserCampus(pax1UserId, tamuCampusId),
      setUserCampus(pax2UserId, tamuCampusId),
      seedTourCompleted(driverUserId),
      seedTourCompleted(pax1UserId),
      seedTourCompleted(pax2UserId),
      seedTermsAcceptance(driverUserId),
      seedTermsAcceptance(pax1UserId),
      seedTermsAcceptance(pax2UserId),
    ])
  })

  // ── 1: Requester sees banner for pending offers ────────────────────────────

  test('requester sees needs-action-banner when a new offer is pending', async ({ driverPage: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })

    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('[data-testid="needs-action-banner"]')).toBeVisible({ timeout: 12_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 2: Helper sees banner after requester counters ────────────────────────

  test('helper sees needs-action-banner after requester counters their offer', async ({ pax1Page: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    const offerId = await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })
    await seedCounterOffer(offerId, 28)

    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('[data-testid="needs-action-banner"]')).toBeVisible({ timeout: 12_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 3: Requester does NOT see banner after they countered (waiting) ────────

  test('requester does NOT see needs-action-banner after they already countered', async ({ driverPage: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    const offerId = await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })
    // Requester countered — now WAITING for helper to respond
    await seedCounterOffer(offerId, 28)

    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      // Banner must NOT appear — requester is waiting, not acting
      await expect(page.locator('[data-testid="needs-action-banner"]')).toHaveCount(0)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 4: Helper's My Offers tab shows counter-label + CTAs ──────────────────

  test('helper sees counter-label and accept/decline CTAs in My Offers tab', async ({ pax1Page: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    const offerId = await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })
    await seedCounterOffer(offerId, 28)

    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Switch to My Offers tab
      await page.getByRole('button', { name: /my offers/i }).click()

      const offerCard = page.locator('[data-testid="my-offer-card"]').first()
      await expect(offerCard).toBeVisible({ timeout: 12_000 })
      await expect(offerCard.locator('[data-testid="counter-label"]')).toBeVisible()
      await expect(offerCard.locator('[data-testid="accept-counter-btn"]')).toBeVisible()
      await expect(offerCard.locator('[data-testid="decline-counter-btn"]')).toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 5: Requester's My Requests view shows counter-sent-status ─────────────

  test('requester sees counter-sent-status after countering an offer', async ({ driverPage: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    const offerId = await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })
    await seedCounterOffer(offerId, 28)

    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Switch to My Requests tab
      await page.getByRole('button', { name: /my requests/i }).click()

      // The InlineOfferRow on the requester's card should show "Counter sent ✓"
      await expect(page.locator('[data-testid="counter-sent-status"]')).toBeVisible({ timeout: 12_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 6: Standalone /dashboard/offers shows accept/decline CTAs ────────────

  test('standalone /dashboard/offers shows accept/decline counter buttons', async ({ pax1Page: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    const offerId = await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })
    await seedCounterOffer(offerId, 28)

    try {
      await page.goto('/dashboard/offers')
      await page.waitForLoadState('networkidle')

      const offerCard = page.locator('[data-testid="my-offer-card"]').first()
      await expect(offerCard).toBeVisible({ timeout: 12_000 })
      await expect(offerCard.locator('[data-testid="accept-counter-btn"]')).toBeVisible()
      await expect(offerCard.locator('[data-testid="decline-counter-btn"]')).toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 7: Unrelated same-campus user has no private counter CTAs ─────────────

  test('unrelated same-campus user does not see private counter CTAs', async ({ pax2Page: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    const offerId = await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })
    await seedCounterOffer(offerId, 28)

    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // pax2 is unrelated — they must not see any counter action buttons
      await expect(page.locator('[data-testid="accept-counter-btn"]')).toHaveCount(0)
      await expect(page.locator('[data-testid="decline-counter-btn"]')).toHaveCount(0)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 8: Cross-campus user does not see the request ─────────────────────────

  test('cross-campus user does not see the request in their feed', async ({ pax2Page: page, runId }) => {
    // Driver and pax1 are on TAMU; pax2 moves to UT Austin
    await setUserCampus(pax2UserId, utAustinCampusId)

    const requestTitle = `[E2E-${runId}] peer_help request`
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30, title: requestTitle })
    await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })

    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Request title must not appear in pax2's campus-scoped feed
      await expect(page.getByText(requestTitle)).toHaveCount(0)
    } finally {
      await cleanupRunData(runId)
      // Restore pax2 to TAMU so other tests are unaffected
      await setUserCampus(pax2UserId, tamuCampusId)
    }
  })

  // ── 9: Sidebar has no request-posting textarea (no duplication) ───────────

  test('sidebar navigation does not contain a request-posting textarea', async ({ driverPage: page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('[data-testid="sidebar-nav"]')
    await expect(sidebar).toBeVisible({ timeout: 10_000 })
    // The request textarea lives in main content — sidebar must not duplicate it
    await expect(sidebar.locator('[data-testid="request-textarea"]')).toHaveCount(0)
  })

  // ── 10: Request-posting textarea is present in main content ───────────────

  test('request-posting textarea is present in main content area', async ({ driverPage: page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-testid="request-textarea"]')).toBeVisible({ timeout: 10_000 })
  })

  // ── 11: Accepting counter on /dashboard/offers removes the counter CTA ────

  test('accepting counter on /dashboard/offers removes accept/decline CTAs', async ({ pax1Page: page, runId }) => {
    const requestId = await seedRequest({ requesterId: driverUserId, runId, category: 'peer_help', budget: 30 })
    const offerId = await seedOffer({ requestId, helperId: pax1UserId, counterBudget: 25 })
    await seedCounterOffer(offerId, 28)

    try {
      await page.goto('/dashboard/offers')
      await page.waitForLoadState('networkidle')

      const offerCard = page.locator('[data-testid="my-offer-card"]').first()
      await expect(offerCard.locator('[data-testid="accept-counter-btn"]')).toBeVisible({ timeout: 12_000 })

      await offerCard.locator('[data-testid="accept-counter-btn"]').click()

      // After accepting, the counter CTA should disappear
      await expect(offerCard.locator('[data-testid="accept-counter-btn"]')).toHaveCount(0, { timeout: 10_000 })
      await expect(offerCard.locator('[data-testid="decline-counter-btn"]')).toHaveCount(0, { timeout: 10_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })
})
