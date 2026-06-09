/**
 * Spec 42 — Factual lifecycle model: getRequestLifecycleState / getOfferLifecycleState
 *
 * Tests:
 *  1.  open_no_offers  → My Requests card shows "View offers" (generic label, no count)
 *  2.  open_with_offers → My Requests card shows "Review N offer(s)" button
 *  3.  expired_no_offers → request card shows Expired label, no Past-due label
 *  4.  expired_with_unaccepted_offers → Expired label (not Past due) even with prior offers
 *  5.  data-lifecycle-state attribute is set on owned request cards
 *  6.  My Offers tab: pending_open offer shows "Waiting for requester to respond"
 *  7.  My Offers tab: pending_expired offer shows Expired badge (lifecycle-driven)
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import {
  adminClient,
  getUserId,
  seedRequest,
  seedOffer,
  seedAcceptOffer,
  cleanupRunData,
  driverCreds,
  pax1Creds,
} from '../helpers/db'

async function seedFutureRequest(requesterId: string, runId: string, suffix: string): Promise<string> {
  return seedRequest({
    requesterId,
    runId,
    category: 'peer_help',
    title: `[E2E-${runId}] lifecycle ${suffix}`,
    scheduledOffsetSeconds: 2 * 60 * 60, // 2h in the future
  })
}

async function seedPastRequest(requesterId: string, runId: string, suffix: string): Promise<string> {
  const pastTime = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString() // 100h ago
  const { data, error } = await adminClient()
    .from('requests')
    .insert({
      requester_id: requesterId,
      category: 'peer_help',
      title: `[E2E-${runId}] lifecycle ${suffix}`,
      urgency: 'medium',
      status: 'open',
      scheduled_time: pastTime,
      flexible_time: false,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

test.describe('Factual lifecycle model', () => {
  test('open_no_offers shows generic View offers label', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'open-no-offers')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lifecycle open-no-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const viewBtn = card.locator('[data-testid="view-offers-btn"]')
      await expect(viewBtn).toBeVisible()
      await expect(viewBtn).toHaveText('View offers')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('open_with_offers shows "Review N offer(s)" button', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'open-with-offers')
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lifecycle open-with-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const viewBtn = card.locator('[data-testid="view-offers-btn"]')
      await expect(viewBtn).toBeVisible()
      await expect(viewBtn).toContainText('Review')
      await expect(viewBtn).toContainText('offer')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('expired_no_offers shows Expired label, no Past-due', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedPastRequest(driverId, runId, 'expired-no-offers')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lifecycle expired-no-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const expiredLabel = card.locator('[data-testid="req-expired-label"]')
      await expect(expiredLabel).toBeVisible()
      await expect(expiredLabel).toContainText('Expired')

      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('expired_with_unaccepted_offers shows Expired, not Past due', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedPastRequest(driverId, runId, 'expired-with-offers')
    // Offer was made but never accepted — should still be "Expired", not "Past due"
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lifecycle expired-with-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const expiredLabel = card.locator('[data-testid="req-expired-label"]')
      await expect(expiredLabel).toBeVisible()
      await expect(expiredLabel).toContainText('Expired')

      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('data-lifecycle-state attribute is set on owned request cards', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'lc-state-attr')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lifecycle lc-state-attr`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Owned cards must expose lifecycle state for automation
      const stateAttr = await card.getAttribute('data-lifecycle-state')
      expect(stateAttr).toBeTruthy()
      expect(stateAttr).toBe('open_no_offers')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('My Offers pending offer shows "Waiting for requester to respond"', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'pending-open')
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] lifecycle pending-open`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const cardText = await card.textContent() ?? ''
      expect(cardText).toMatch(/waiting for requester to respond/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('My Offers pending offer on expired request shows Expired badge', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedPastRequest(driverId, runId, 'pending-expired')
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] lifecycle pending-expired`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="my-offer-status-badge"]')
      await expect(badge).toHaveText('Expired')

      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })
})
