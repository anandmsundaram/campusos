/**
 * Spec 39 — Marketplace lifecycle and offer clarity
 *
 * Tests:
 *  1.  Expired request (past scheduled_time) is NOT shown in All Open feed
 *  2.  Fresh request (no scheduled_time, just created) IS shown in All Open
 *  3.  Pending offer on expired request shows "Expired" status in My Offers
 *  4.  Offer amount above $500 is rejected by client validation
 *  5.  Offer amount of $0 passes client validation
 */

import { test, expect, goToDashboard, goToMyOffers, requestCard, myOfferCard } from '../helpers/fixtures'
import {
  seedRequest,
  seedOffer,
  getUserId,
  driverCreds,
  pax1Creds,
  cleanupRunData,
} from '../helpers/db'

test.describe('Lifecycle — All Open feed filtering', () => {
  test('expired request is absent; fresh request is present in All Open', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)

    // Fresh request — no scheduled_time, created just now → visible
    const freshId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'errands',
      title: `[E2E-${runId}] fresh-errand`,
      budget: 10,
    })

    // Expired request — scheduled_time 3 h in the past → must be filtered out
    const expiredId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'errands',
      title: `[E2E-${runId}] expired-errand`,
      budget: 10,
      scheduledOffsetSeconds: -10_800,
    })

    try {
      await goToDashboard(pax1Page)

      // Fresh request IS in All Open (baseline visibility check)
      await expect(requestCard(pax1Page, freshId)).toBeVisible({ timeout: 12_000 })

      // Expired request is NOT present — server filtered it
      await expect(requestCard(pax1Page, expiredId)).not.toBeVisible({ timeout: 5_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })
})

test.describe('Lifecycle — My Offers expiry display', () => {
  test('pending offer on expired request shows Expired status — not Pending', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Expired request from driver (scheduled 3 h ago)
    const expiredRequestId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'errands',
      title: `[E2E-${runId}] expired-for-offer`,
      budget: 15,
      scheduledOffsetSeconds: -10_800,
    })

    // pax1 has a pending offer on that request
    const offerId = await seedOffer({
      requestId: expiredRequestId,
      helperId: pax1Id,
      message: 'I can help',
    })

    try {
      await goToDashboard(pax1Page)
      await goToMyOffers(pax1Page)

      const card = myOfferCard(pax1Page, offerId)
      await expect(card).toBeVisible({ timeout: 12_000 })

      // Status badge must show "Expired", not "Pending"
      const badge = card.locator('[data-testid="my-offer-status-badge"]')
      await expect(badge).toContainText('Expired', { timeout: 5_000 })
      await expect(badge).not.toContainText('Pending')
    } finally {
      await cleanupRunData(runId)
    }
  })
})

test.describe('Lifecycle — Amount validation', () => {
  test('offer amount above $500 is rejected with a client-side error', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)

    // Fresh open request — pax1 can offer on it
    const requestId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'errands',
      title: `[E2E-${runId}] amount-validation-high`,
      budget: 20,
    })

    try {
      await goToDashboard(pax1Page)

      const card = requestCard(pax1Page, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })
      await card.locator('[data-testid="offer-cta-btn"]').click()

      // Offer modal should appear
      await expect(pax1Page.getByRole('dialog')).toBeVisible({ timeout: 6_000 })

      // Enter an absurd amount
      await pax1Page.locator('[data-testid="offer-price-input"]').fill('9999')
      await pax1Page.locator('[data-testid="offer-submit-btn"]').click()

      // Client-side error must appear — modal stays open
      const err = pax1Page.locator('[data-testid="offer-modal-error"]')
      await expect(err).toBeVisible({ timeout: 5_000 })
      await expect(err).toContainText(/\$500|[Mm]aximum|beta/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('offer amount of $0 passes client validation', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)

    // A separate fresh request for the $0 test
    const requestId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] amount-validation-zero`,
      budget: 0,
    })

    try {
      await goToDashboard(pax1Page)

      const card = requestCard(pax1Page, requestId)
      await expect(card).toBeVisible({ timeout: 12_000 })
      await card.locator('[data-testid="offer-cta-btn"]').click()

      const dialog = pax1Page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 6_000 })

      // Enter $0 — client validation must pass (no "Maximum" / "negative" error)
      await pax1Page.locator('[data-testid="offer-price-input"]').fill('0')
      await pax1Page.locator('[data-testid="offer-submit-btn"]').click({ noWaitAfter: true })

      // Modal should close — $0 is accepted by both client and server
      await expect(dialog).not.toBeVisible({ timeout: 20_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })
})
