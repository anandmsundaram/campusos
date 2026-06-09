/**
 * Spec 41 — Accepted past-due and completion clarity
 *
 * Tests:
 *  1.  Past needed time + no accepted offer = "Expired" (not "Past due")
 *  2.  Past needed time + accepted offer + not completed = "Past due" (not "Expired")
 *  3.  Past needed time + accepted offer + completed = "Completed" (not "Expired")
 *  4.  One accepted offer causes other pending offers to show "Expired", not "Past due"
 *  5.  My Offers card shows "Past due" badge for accepted_past_due
 *  6.  /dashboard/offers does not show "Expired" for an accepted offer that is past-due
 *  7.  My Requests card shows "Past due — awaiting completion" for matched + past scheduled_time
 *  8.  My Requests card shows "Expired — no helper accepted" for open + past scheduled_time
 */

import { test, expect, goToDashboard, goToMyOffers } from '../helpers/fixtures'
import {
  adminClient,
  getUserId,
  seedRequest,
  seedOffer,
  seedAcceptOffer,
  cleanupRunData,
  driverCreds,
  pax1Creds,
  pax2Creds,
} from '../helpers/db'

/** Insert a request with a past scheduled_time directly (bypassing seedRequest offset). */
async function seedPastRequest(
  requesterId: string,
  runId: string,
  titleSuffix = 'request',
  extraStatus: 'open' | 'matched' = 'open',
): Promise<string> {
  const pastTime = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString() // 100h ago, well past 72h window
  const { data, error } = await adminClient()
    .from('requests')
    .insert({
      requester_id: requesterId,
      category: 'peer_help',
      title: `[E2E-${runId}] past-due ${titleSuffix}`,
      urgency: 'medium',
      status: extraStatus,
      scheduled_time: pastTime,
      flexible_time: false,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

test.describe('Accepted past-due and completion clarity', () => {
  test('past needed time + no accepted offer shows Expired badge on offer card', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)

    const reqId = await seedPastRequest(driverId, runId, 'no-offer-expired')
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] past-due no-offer-expired`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="my-offer-status-badge"]')
      await expect(badge).toHaveText('Expired')
      // Must NOT show "Past due"
      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('past needed time + accepted offer + not completed shows Past due, not Expired', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)

    const reqId = await seedPastRequest(driverId, runId, 'accepted-past-due')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)

    try {
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] past-due accepted-past-due`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="my-offer-status-badge"]')
      await expect(badge).toContainText('Past due')
      // Must NOT show "Expired"
      await expect(badge).not.toHaveText('Expired')
      // Next-action text should mention past due
      const cardText = await card.textContent() ?? ''
      expect(cardText).toMatch(/past due/i)
      expect(cardText).not.toMatch(/expired — no accepted helper/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('past needed time + accepted offer + completed shows Completed, not Expired', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)

    const reqId = await seedPastRequest(driverId, runId, 'completed')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)
    // Mark the request as completed
    await adminClient().from('requests').update({ status: 'completed' }).eq('id', reqId)

    try {
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] past-due completed`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const cardText = await card.textContent() ?? ''
      // Must show Completed, not Expired or Past due
      expect(cardText).toMatch(/completed/i)
      expect(cardText).not.toMatch(/expired — no accepted helper/i)
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('pending offer on request that accepted a different helper shows Expired badge (no helper accepted this offer)', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const pax2Id   = await getUserId(pax2Creds().email)

    // driverCreds creates the request; pax1 and pax2 both offer; pax2 gets accepted; pax1 is left pending
    const reqId   = await seedPastRequest(driverId, runId, 'not-selected')
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'pax1 offer' })
    const pax2OfferId = await seedOffer({ requestId: reqId, helperId: pax2Id, message: 'pax2 offer' })
    await seedAcceptOffer(pax2OfferId, reqId)

    try {
      // pax1's pending offer on an expired+matched request should show Expired (no helper accepted for pax1)
      // pax1's offer is still pending, and the request is expired from pax1's perspective
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] past-due not-selected`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="my-offer-status-badge"]')
      // pax1's offer is pending on a past-due request → should be Expired (not Past due)
      await expect(badge).toHaveText('Expired')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('My Requests tab shows "Past due — awaiting completion" for matched + past scheduled_time', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)

    const reqId = await seedPastRequest(driverId, runId, 'req-past-due')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      // Look in the Past section for this request
      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] past-due req-past-due`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const pastDueLabel = card.locator('[data-testid="req-past-due-label"]')
      await expect(pastDueLabel).toBeVisible()
      await expect(pastDueLabel).toContainText('Past due')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('My Requests tab shows "Expired — no helper accepted" for open + past scheduled_time', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    // Request with past time, no offers at all
    const reqId = await seedPastRequest(driverId, runId, 'req-expired')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] past-due req-expired`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const expiredLabel = card.locator('[data-testid="req-expired-label"]')
      await expect(expiredLabel).toBeVisible()
      await expect(expiredLabel).toContainText('Expired')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('/dashboard/offers does not label an accepted past-due offer as Expired', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)

    const reqId = await seedPastRequest(driverId, runId, 'offers-page-past-due')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)

    try {
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] past-due offers-page-past-due`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="my-offer-status-badge"]')
      await expect(badge).not.toHaveText('Expired')
      await expect(badge).toContainText(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })
})
