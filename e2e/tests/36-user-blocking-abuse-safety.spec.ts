/**
 * Spec 36 — User blocking and abuse safety
 *
 * Verifies the full blocking lifecycle: blocking a user, blocked state
 * reflected in the UI (InlineOfferRow, request card), managing blocked users
 * at /dashboard/blocked, unblocking, server-side offer guard, and admin
 * safety event audit trail.
 *
 * User roles:
 *  driver = requester (creates requests; tests seeing "Blocked" on helper offers)
 *  pax1   = helper    (submits offers; tests blocking the requester; tests
 *                      being blocked by driver)
 *  pax2   = campus_admin (verifies safety-section on admin page)
 *
 * Tests:
 *  1.  Sidebar shows "Blocked Users" link
 *  2.  /dashboard/blocked loads with empty state when no blocks exist
 *  3.  Block modal opens when non-owner clicks block button on a request card
 *  4.  Block modal submit is disabled until a reason is selected
 *  5.  Submitting block shows success done state
 *  6.  After blocking, block-user-btn is gone for the same requester
 *  7.  Blocked user appears on /dashboard/blocked
 *  8.  Unblock button opens UnblockModal
 *  9.  UnblockModal submit disabled until reason selected
 * 10.  Confirming unblock removes user from blocked list
 * 11.  Offer from a blocked helper shows "Blocked" label (not action CTAs)
 * 12.  Blocked helper cannot submit a new offer — server guard returns error
 * 13.  Admin page shows Safety Events section
 * 14.  Block event appears in admin safety events after a block
 * 15.  Unblock event appears in admin safety events after an unblock
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import {
  getUserId,
  driverCreds,
  pax1Creds,
  pax2Creds,
  seedRequest,
  seedOffer,
  seedTourCompleted,
  seedTermsAcceptance,
  getCampusId,
  setUserCampus,
  setUserAdminRole,
  cleanupRunData,
  seedUserBlock,
  clearUserBlock,
} from '../helpers/db'

test.describe('User blocking and abuse safety', () => {
  let driverUserId: string
  let pax1UserId: string
  let pax2UserId: string
  let tamuCampusId: string

  test.beforeAll(async () => {
    ;[driverUserId, pax1UserId, pax2UserId, tamuCampusId] = await Promise.all([
      getUserId(driverCreds().email),
      getUserId(pax1Creds().email),
      getUserId(pax2Creds().email),
      getCampusId('tamu'),
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
      setUserAdminRole(driverUserId, 'user'),
      setUserAdminRole(pax1UserId, 'user'),
      setUserAdminRole(pax2UserId, 'user'),
      // Ensure no leftover blocks from prior tests
      clearUserBlock(driverUserId, pax1UserId),
    ])
  })

  // ── 1: Sidebar shows Blocked Users link ─────────────────────────────────────

  test('sidebar shows Blocked Users link', async ({ pax1Page: page }) => {
    await goToDashboard(page)
    const link = page.getByRole('link', { name: /Blocked Users/i })
    await expect(link).toBeVisible()
  })

  // ── 2: Empty blocked users page ─────────────────────────────────────────────

  test('/dashboard/blocked shows empty state when no blocks exist', async ({ pax1Page: page }) => {
    await page.goto('/dashboard/blocked')
    await expect(page.getByTestId('blocked-users-page')).toBeVisible()
    await expect(page.getByText(/No blocked users/i)).toBeVisible()
  })

  // ── 3: Block modal opens from request card ───────────────────────────────────

  test('block modal opens when non-owner clicks block button on a request card', async ({
    driverPage,
    pax1Page: page,
    runId,
  }) => {
    const requestId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      budget: 20,
    })

    try {
      await goToDashboard(page)
      const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
      await card.scrollIntoViewIfNeeded()
      await card.locator('[data-testid="block-user-btn"]').click()
      await expect(page.getByTestId('block-modal')).toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 4: Block modal submit disabled until reason selected ─────────────────────

  test('block modal submit button is disabled until a reason is selected', async ({
    driverPage,
    pax1Page: page,
    runId,
  }) => {
    const requestId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      budget: 20,
    })

    try {
      await goToDashboard(page)
      const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
      await card.scrollIntoViewIfNeeded()
      await card.locator('[data-testid="block-user-btn"]').click()
      const modal = page.getByTestId('block-modal')
      await expect(modal).toBeVisible()
      await expect(modal.getByTestId('block-submit-btn')).toBeDisabled()

      await modal.getByTestId('block-reason-select').selectOption('harassment')
      await expect(modal.getByTestId('block-submit-btn')).toBeEnabled()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ── 5: Submitting block shows success state ───────────────────────────────────

  test('submitting block with reason shows success state', async ({
    driverPage,
    pax1Page: page,
    runId,
  }) => {
    const requestId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      budget: 20,
    })

    try {
      await goToDashboard(page)
      const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
      await card.scrollIntoViewIfNeeded()
      await card.locator('[data-testid="block-user-btn"]').click()
      const modal = page.getByTestId('block-modal')
      await modal.getByTestId('block-reason-select').selectOption('harassment')
      await modal.getByTestId('block-submit-btn').click()
      await expect(modal.getByTestId('block-modal-done')).toBeVisible({ timeout: 8_000 })
    } finally {
      await clearUserBlock(pax1UserId, driverUserId)
      await cleanupRunData(runId)
    }
  })

  // ── 6: Block button hidden after blocking ────────────────────────────────────

  test('block-user-btn is absent for a requester that has already been blocked', async ({
    driverPage,
    pax1Page: page,
    runId,
  }) => {
    // seed a pre-existing block: pax1 already blocked driver
    await seedUserBlock(pax1UserId, driverUserId, 'harassment')
    const requestId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      budget: 20,
    })

    try {
      await goToDashboard(page)
      const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
      await card.scrollIntoViewIfNeeded()
      // Button should be absent because driver is already blocked
      await expect(card.locator('[data-testid="block-user-btn"]')).toHaveCount(0)
    } finally {
      await clearUserBlock(pax1UserId, driverUserId)
      await cleanupRunData(runId)
    }
  })

  // ── 7: Blocked user appears on /dashboard/blocked ────────────────────────────

  test('blocked user appears in the blocked-users list', async ({
    pax1Page: page,
    runId,
  }) => {
    await seedUserBlock(pax1UserId, driverUserId, 'scam_fraud')

    try {
      await page.goto('/dashboard/blocked')
      await expect(page.getByTestId('blocked-users-page')).toBeVisible()
      const row = page.getByTestId('blocked-user-row').first()
      await expect(row).toBeVisible({ timeout: 8_000 })
      // The profile name may not match driverCreds().name; check the reason instead
      await expect(row).toContainText('scam fraud')
    } finally {
      await clearUserBlock(pax1UserId, driverUserId)
    }
  })

  // ── 8: Unblock button opens UnblockModal ─────────────────────────────────────

  test('unblock button opens UnblockModal', async ({ pax1Page: page }) => {
    await seedUserBlock(pax1UserId, driverUserId, 'scam_fraud')

    try {
      await page.goto('/dashboard/blocked')
      await page.getByTestId('unblock-btn').first().click()
      await expect(page.getByTestId('unblock-modal')).toBeVisible()
    } finally {
      await clearUserBlock(pax1UserId, driverUserId)
    }
  })

  // ── 9: UnblockModal submit disabled until reason selected ────────────────────

  test('unblock submit button is disabled until a reason is selected', async ({ pax1Page: page }) => {
    await seedUserBlock(pax1UserId, driverUserId, 'scam_fraud')

    try {
      await page.goto('/dashboard/blocked')
      await page.getByTestId('unblock-btn').first().click()
      const modal = page.getByTestId('unblock-modal')
      await expect(modal).toBeVisible()
      await expect(modal.getByTestId('unblock-submit-btn')).toBeDisabled()

      await modal.getByTestId('unblock-reason-select').selectOption('resolved')
      await expect(modal.getByTestId('unblock-submit-btn')).toBeEnabled()
    } finally {
      await clearUserBlock(pax1UserId, driverUserId)
    }
  })

  // ── 10: Confirming unblock removes user from list ────────────────────────────

  test('confirming unblock removes user from the blocked list', async ({ pax1Page: page }) => {
    await seedUserBlock(pax1UserId, driverUserId, 'scam_fraud')

    await page.goto('/dashboard/blocked')
    await page.getByTestId('unblock-btn').first().click()
    const modal = page.getByTestId('unblock-modal')
    await modal.getByTestId('unblock-reason-select').selectOption('resolved')
    await modal.getByTestId('unblock-submit-btn').click()

    await expect(page.getByTestId('blocked-user-row')).toHaveCount(0, { timeout: 8_000 })
    await expect(page.getByText(/No blocked users/i)).toBeVisible()
  })

  // ── 11: Offer from blocked helper shows "Blocked" label ──────────────────────

  test('offer row shows Blocked label when requester has blocked the helper', async ({
    driverPage: page,
    runId,
  }) => {
    const requestId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      budget: 20,
    })
    await seedOffer({ requestId, helperId: pax1UserId })
    await seedUserBlock(driverUserId, pax1UserId, 'inappropriate')

    try {
      await goToDashboard(page)
      // Close any auto-opened "Offers received" modal before checking card state
      const autoModal = page.getByRole('dialog').filter({ hasText: /Offers received/i })
      if (await autoModal.isVisible()) {
        await autoModal.getByRole('button', { name: /close|✕|×/i }).first().click()
        await page.waitForTimeout(200)
      }
      await page.getByRole('button', { name: /My Requests/i }).click()
      await page.waitForTimeout(600)
      const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
      await card.scrollIntoViewIfNeeded()
      // If offers are behind a "View offers" toggle, open it
      const viewOffersBtn = card.getByRole('button', { name: /view offers/i })
      if (await viewOffersBtn.isVisible()) {
        await viewOffersBtn.click()
        await page.waitForTimeout(300)
      }
      // InlineOfferRow shows an italic "Blocked" span when isBlockedHelper=true
      await expect(card.getByText('Blocked', { exact: true }).first()).toBeVisible({ timeout: 8_000 })
    } finally {
      await clearUserBlock(driverUserId, pax1UserId)
      await cleanupRunData(runId)
    }
  })

  // ── 12: Blocked helper cannot submit a new offer (server guard) ───────────────

  test('blocked helper receives an error when trying to submit a new offer', async ({
    driverPage,
    pax1Page: page,
    runId,
  }) => {
    const requestId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      budget: 20,
    })
    // driver blocks pax1 — pax1 is now the blocked helper
    await seedUserBlock(driverUserId, pax1UserId, 'inappropriate')

    try {
      await goToDashboard(page)
      // pax1 still sees the request in the feed (blocking doesn't hide requests)
      const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
      await card.scrollIntoViewIfNeeded()
      // Click the CTA button ("I can help" for peer_help) to open the offer modal
      const ctaBtn = card.getByRole('button', { name: /I can help|Offer to help/i })
      await ctaBtn.click()
      // Submit the offer (price field is optional; submit without changing it)
      await page.getByTestId('offer-submit-btn').click()
      // The server guard should reject with an error
      await expect(page.getByTestId('offer-modal-error')).toContainText(
        /cannot offer|blocked/i,
        { timeout: 8_000 },
      )
    } finally {
      await clearUserBlock(driverUserId, pax1UserId)
      await cleanupRunData(runId)
    }
  })

  // ── 13: Admin page shows Safety Events section ───────────────────────────────

  test('admin page renders safety-section for a campus admin', async ({ pax2Page: page }) => {
    await setUserAdminRole(pax2UserId, 'campus_admin')
    try {
      await page.goto('/dashboard/admin')
      await expect(page.getByTestId('safety-section')).toBeVisible({ timeout: 10_000 })
    } finally {
      await setUserAdminRole(pax2UserId, 'user')
    }
  })

  // ── 14: Block event visible in admin safety events ────────────────────────────

  test('block event appears in admin safety events after a block is created', async ({
    driverPage,
    pax1Page: helperPage,
    pax2Page: adminPage,
    runId,
  }) => {
    const requestId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      budget: 20,
    })
    await setUserAdminRole(pax2UserId, 'global_admin')

    try {
      // pax1 blocks driver via the UI
      await goToDashboard(helperPage)
      const card = helperPage.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
      await card.scrollIntoViewIfNeeded()
      await card.locator('[data-testid="block-user-btn"]').click()
      const modal = helperPage.getByTestId('block-modal')
      await modal.getByTestId('block-reason-select').selectOption('safety_concern')
      await modal.getByTestId('block-submit-btn').click()
      await expect(modal.getByTestId('block-modal-done')).toBeVisible({ timeout: 8_000 })

      // Admin sees the block event
      await adminPage.goto('/dashboard/admin')
      const safetySection = adminPage.getByTestId('safety-section')
      await expect(safetySection).toBeVisible({ timeout: 10_000 })
      await expect(safetySection).toContainText(/block/i)
    } finally {
      await clearUserBlock(pax1UserId, driverUserId)
      await setUserAdminRole(pax2UserId, 'user')
      await cleanupRunData(runId)
    }
  })

  // ── 15: Unblock event visible in admin safety events ─────────────────────────

  test('unblock event appears in admin safety events after an unblock', async ({
    pax1Page: page,
    pax2Page: adminPage,
  }) => {
    await seedUserBlock(pax1UserId, driverUserId, 'other')
    await setUserAdminRole(pax2UserId, 'global_admin')

    try {
      // pax1 unblocks driver via the UI
      await page.goto('/dashboard/blocked')
      await page.getByTestId('unblock-btn').first().click()
      const modal = page.getByTestId('unblock-modal')
      await modal.getByTestId('unblock-reason-select').selectOption('reconciled')
      await modal.getByTestId('unblock-submit-btn').click()
      await expect(page.getByText(/No blocked users/i)).toBeVisible({ timeout: 8_000 })

      // Admin sees the unblock event
      await adminPage.goto('/dashboard/admin')
      const safetySection = adminPage.getByTestId('safety-section')
      await expect(safetySection).toBeVisible({ timeout: 10_000 })
      await expect(safetySection).toContainText(/unblock/i)
    } finally {
      await clearUserBlock(pax1UserId, driverUserId)
      await setUserAdminRole(pax2UserId, 'user')
    }
  })
})
