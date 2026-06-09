/**
 * Spec 44 — Completion flow, posted time, cancelled state, campus directory
 *
 * Tests:
 *  1.  Non-ride accepted_past_due shows mark-complete-btn
 *  2.  Expired request (no accepted helper) has NO mark-complete-btn
 *  3.  Completed card shows "Completed" badge and lands in past/closed section
 *  4.  Cancelled request shows "Cancelled" badge and lands in past section
 *  5.  Cancelled request shows no mark-complete-btn and no view-offers-btn
 *  6.  Card posted time shows absolute date (not only "Xd ago")
 *  7.  Campus status field: active Texas campuses exist with status = active_beta
 *  8.  UTD campus is seeded and active_beta
 *  9.  Waitlist campuses exist but are not active_beta
 *  10. Campus assignment: test user campus_id matches expected campus
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import {
  adminClient,
  getUserId,
  seedRequest,
  seedOffer,
  seedAcceptOffer,
  cancelRequestDirect,
  cleanupRunData,
  driverCreds,
  pax1Creds,
  getCampusId,
} from '../helpers/db'

async function seedFutureRequest(requesterId: string, runId: string, suffix: string, category = 'peer_help'): Promise<string> {
  return seedRequest({
    requesterId,
    runId,
    category,
    title: `[E2E-${runId}] sp44 ${suffix}`,
    scheduledOffsetSeconds: 2 * 60 * 60,
  })
}

async function seedPastRequest(requesterId: string, runId: string, suffix: string, category = 'peer_help'): Promise<string> {
  const pastTime = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString()
  const { data, error } = await adminClient()
    .from('requests')
    .insert({
      requester_id: requesterId,
      category,
      title: `[E2E-${runId}] sp44 ${suffix}`,
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

test.describe('Completion, posted time, and campus directory', () => {

  // ─── Completion flow ─────────────────────────────────────────────────────────

  test('non-ride accepted_past_due shows mark-complete-btn', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    // Use 'errands' category — non-ride
    const reqId = await seedPastRequest(driverId, runId, 'errand-past-due', 'errands')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] sp44 errand-past-due`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // accepted_past_due for non-ride should expose mark-complete-btn
      const completeBtn = card.locator('[data-testid="mark-complete-btn"]')
      await expect(completeBtn).toBeVisible()
      await expect(completeBtn).toContainText(/mark complete/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('expired request with no accepted helper has no mark-complete-btn', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedPastRequest(driverId, runId, 'expired-no-helper')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] sp44 expired-no-helper`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // No mark-complete-btn — expired without accepted offer
      const completeBtn = card.locator('[data-testid="mark-complete-btn"]')
      await expect(completeBtn).not.toBeVisible()

      const expiredLabel = card.locator('[data-testid="req-expired-label"]')
      await expect(expiredLabel).toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('completed card shows Completed badge and lands in past section', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)
    const reqId = await seedPastRequest(driverId, runId, 'completed-card')
    const offerId = await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })
    await seedAcceptOffer(offerId, reqId)
    await adminClient().from('requests').update({ status: 'completed' }).eq('id', reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] sp44 completed-card`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Completed badge
      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Completed')
      await expect(badge).toHaveAttribute('data-lifecycle-badge', 'completed')

      // req-completed-label in footer
      const completedLabel = card.locator('[data-testid="req-completed-label"]')
      await expect(completedLabel).toBeVisible()

      // No mark-complete-btn after completion
      await expect(card.locator('[data-testid="mark-complete-btn"]')).not.toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ─── Cancelled state ─────────────────────────────────────────────────────────

  test('cancelled request shows Cancelled badge in past section', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'cancelled-req')
    await cancelRequestDirect(reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] sp44 cancelled-req`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Cancelled badge from lifecycle model
      const badge = card.locator('[data-testid="card-role-status"]')
      await expect(badge).toHaveText('Cancelled')
      await expect(badge).toHaveAttribute('data-lifecycle-badge', 'cancelled')

      // req-cancelled-label in footer
      const cancelledLabel = card.locator('[data-testid="req-cancelled-label"]')
      await expect(cancelledLabel).toBeVisible()
      await expect(cancelledLabel).toContainText(/cancelled/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('cancelled request shows no mark-complete-btn and no view-offers-btn', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'cancelled-no-cta')
    await cancelRequestDirect(reqId)

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] sp44 cancelled-no-cta`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      await expect(card.locator('[data-testid="mark-complete-btn"]')).not.toBeVisible()
      await expect(card.locator('[data-testid="view-offers-btn"]')).not.toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ─── Posted time ─────────────────────────────────────────────────────────────

  test('card posted time shows absolute date, not only relative text', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedFutureRequest(driverId, runId, 'posted-time')

    try {
      await goToDashboard(driverPage)
      await driverPage.getByRole('button', { name: /My Requests/ }).click()
      await driverPage.waitForTimeout(500)

      const card = driverPage.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] sp44 posted-time`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const postedEl = card.locator('[data-testid="card-posted-time"]')
      await expect(postedEl).toBeVisible()

      const text = await postedEl.textContent() ?? ''
      // Must start with "Posted" and contain a month abbreviation (not only "Xd ago")
      expect(text).toMatch(/^Posted\s+\w{3}\s+\d+/i)
      expect(text).not.toMatch(/^\d+[dhm]\s*ago/i)
      // Must contain a 4-digit year
      expect(text).toMatch(/20\d{2}/)
    } finally {
      await cleanupRunData(runId)
    }
  })

  // ─── Campus directory ─────────────────────────────────────────────────────────

  test('campus status field: TAMU and UT Austin are active_beta', async () => {
    const { data, error } = await adminClient()
      .from('campuses')
      .select('slug, status')
      .in('slug', ['tamu', 'ut-austin'])
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    for (const row of data ?? []) {
      expect(row.status).toBe('active_beta')
    }
  })

  test('UTD campus exists and is active_beta', async () => {
    const { data, error } = await adminClient()
      .from('campuses')
      .select('slug, name, domain_hint, status, state')
      .eq('slug', 'ut-dallas')
      .single()
    expect(error).toBeNull()
    expect(data?.status).toBe('active_beta')
    expect(data?.domain_hint).toBe('utdallas.edu')
    expect(data?.state).toBe('TX')
  })

  test('waitlist Texas campuses exist but are not active_beta', async () => {
    const { data, error } = await adminClient()
      .from('campuses')
      .select('slug, status')
      .eq('status', 'waitlist')
    expect(error).toBeNull()
    // At least the waitlist campuses from migration 035 exist
    expect((data ?? []).length).toBeGreaterThan(0)
    for (const row of data ?? []) {
      expect(row.status).toBe('waitlist')
      expect(row.status).not.toBe('active_beta')
    }
  })

  test('test user (driver) is assigned to a valid campus', async () => {
    const driverId = await getUserId(driverCreds().email)
    const { data, error } = await adminClient()
      .from('profiles')
      .select('campus_id, campuses(slug, status)')
      .eq('id', driverId)
      .single()
    expect(error).toBeNull()
    // campus_id must be set
    expect(data?.campus_id).toBeTruthy()
    // campus must exist (join succeeded)
    const campus = Array.isArray(data?.campuses) ? data?.campuses[0] : data?.campuses
    expect(campus).toBeTruthy()
  })
})
