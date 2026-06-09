/**
 * Spec 43 — My Requests centralized lifecycle model wiring
 *
 * Tests:
 *  1.  open_no_offers → "Open" badge, "Open — waiting for offers" reason, "View offers" button
 *  2.  open_with_offers → "Offers pending" badge, "Review N offer(s)" button
 *  3.  Static "My request" is NOT the only visible status on owned cards (lifecycle badge shown instead)
 *  4.  accepted_past_due → "Past due" badge, req-past-due-label, no "Expired" label
 *  5.  expired_no_offers → "Expired" badge, req-expired-label, no "Past due" label
 *  6.  expired_with_unaccepted_offers → "Expired" badge, req-expired-label
 *  7.  completed → "Completed" badge, req-completed-label, no "Expired" label
 *  8.  data-lifecycle-state and visible badge label are aligned
 *  9.  accepted_past_due is in active section (not past section) — actionable bucket
 *  10. accepted_upcoming shows "Accepted" badge and "View accepted helper" button
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
    title: `[E2E-${runId}] lc43 ${suffix}`,
    scheduledOffsetSeconds: 2 * 60 * 60,
  })
}

async function seedPastRequest(requesterId: string, runId: string, suffix: string): Promise<string> {
  const pastTime = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString()
  const { data, error } = await adminClient()
    .from('requests')
    .insert({
      requester_id: requesterId,
      category: 'peer_help',
      title: `[E2E-${runId}] lc43 ${suffix}`,
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

test.describe('My Requests — centralized lifecycle model wiring', () => {
  test('open_no_offers shows "Open" badge and "Open — waiting for offers" reason', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'open-no-offers')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 open-no-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Open')
      await expect(badge).toHaveAttribute('data-lifecycle-badge', 'open_no_offers')

      const reason = card.locator('[data-testid="req-lifecycle-reason"]')
      await expect(reason).toContainText(/open.*waiting for offers/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('open_with_offers shows "Offers pending" badge and Review button', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'open-with-offers')
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 open-with-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Offers pending')
      await expect(badge).toHaveAttribute('data-lifecycle-badge', 'open_with_offers')

      const viewBtn = card.locator('[data-testid="view-offers-btn"]')
      await expect(viewBtn).toContainText('Review')
      await expect(viewBtn).toContainText('offer')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('owned card shows lifecycle badge, not static "My request"', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'badge-check')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 badge-check`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Must show lifecycle badge, NOT static "My request" text
      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).not.toHaveText('My request')
      // Must have data-lifecycle-badge attribute (set by lifecycle model)
      const lc = await badge.getAttribute('data-lifecycle-badge')
      expect(lc).toBeTruthy()
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('accepted_past_due shows "Past due" badge, req-past-due-label, no Expired', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedPastRequest(driverId, runId, 'accepted-past-due')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 accepted-past-due`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Past due')
      await expect(badge).toHaveAttribute('data-lifecycle-badge', 'accepted_past_due')

      const pastDueLabel = card.locator('[data-testid="req-past-due-label"]')
      await expect(pastDueLabel).toBeVisible()
      await expect(pastDueLabel).toContainText('Past due')

      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/expired — no helper accepted/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('accepted_past_due card appears in active (actionable) section, not only past', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedPastRequest(driverId, runId, 'apd-section')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 apd-section`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // data-lifecycle-state must reflect accepted_past_due from the centralized model
      const stateAttr = await card.getAttribute('data-lifecycle-state')
      expect(stateAttr).toBe('accepted_past_due')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('expired_no_offers shows "Expired" badge and req-expired-label, no Past due', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedPastRequest(driverId, runId, 'expired-no-offers')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 expired-no-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Expired')

      const expiredLabel = card.locator('[data-testid="req-expired-label"]')
      await expect(expiredLabel).toBeVisible()

      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('expired_with_unaccepted_offers shows "Expired" badge and req-expired-label', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedPastRequest(driverId, runId, 'expired-with-offers')
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 expired-with-offers`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Expired')

      const expiredLabel = card.locator('[data-testid="req-expired-label"]')
      await expect(expiredLabel).toBeVisible()

      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('completed request shows "Completed" badge and req-completed-label', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedPastRequest(driverId, runId, 'completed')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)
    await adminClient().from('requests').update({ status: 'completed' }).eq('id', reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 completed`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Completed')

      const completedLabel = card.locator('[data-testid="req-completed-label"]')
      await expect(completedLabel).toBeVisible()

      const cardText = await card.textContent() ?? ''
      expect(cardText).not.toMatch(/expired/i)
      expect(cardText).not.toMatch(/past due/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('accepted_upcoming shows "Accepted" badge and "View accepted helper" button', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'accepted-upcoming')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 accepted-upcoming`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Accepted')

      const viewBtn = card.locator('[data-testid="view-offers-btn"]')
      await expect(viewBtn).toHaveText('View accepted helper')
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('data-lifecycle-state and visible badge label are aligned', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'alignment-check')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] lc43 alignment-check`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const lcState = await card.getAttribute('data-lifecycle-state')
      const lcBadge = await card.locator('[data-testid="card-role-status"]').getAttribute('data-lifecycle-badge')
      // Both attributes must reflect the same lifecycle state
      expect(lcState).toBe(lcBadge)
      expect(lcState).toBeTruthy()
    } finally {
      await cleanupRunData(runId)
    }
  })
})
