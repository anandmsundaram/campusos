/**
 * Spec 40 — Datetime storage and absolute date display
 *
 * Tests:
 *  1.  Request with scheduled_time shows an absolute date (not relative "14d ago")
 *  2.  Request with legacy deadline_text does NOT display raw "Today" / "Tomorrow" verbatim
 *  3.  Expired offer next-action includes date context (not just "Expired")
 */

import { test, expect, goToDashboard, goToMyOffers } from '../helpers/fixtures'
import {
  getUserId,
  seedRequest,
  seedOffer,
  adminClient,
  cleanupRunData,
  driverCreds,
  pax1Creds,
} from '../helpers/db'

test.describe('Datetime storage and absolute date display', () => {
  test('request with scheduled_time shows absolute date in feed card', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    // Seed a peer_help request with scheduled_time 2h from now
    const reqId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] datetime-abs-date peer help`,
      scheduledOffsetSeconds: 7200,  // 2h from now → absolute date must show
    })

    try {
      await goToDashboard(pax1Page)

      // Wait for the card to appear in the feed
      const card = pax1Page.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] datetime-abs-date peer help`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // The card-time-meta should show an absolute date, not a relative string
      const timeMeta = card.locator('[data-testid="card-time-meta"]')
      await expect(timeMeta).toBeVisible()
      const timeText = await timeMeta.textContent() ?? ''

      // Must contain a month abbreviation (Jan–Dec) — absolute date
      expect(timeText).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)
      // Must NOT be a relative label
      expect(timeText).not.toMatch(/\b(today|tomorrow|14d|days? ago)\b/i)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('request with legacy deadline_text does not display raw "Today" or "Tomorrow"', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    // Seed a request with old-style vague deadline_text and no scheduled_time
    const reqId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'errands',
      title: `[E2E-${runId}] datetime-legacy-label errand`,
      structuredData: { deadline_text: 'Today, flexible time' },
      // no scheduledOffsetSeconds → scheduled_time stays null
    })

    try {
      await goToDashboard(pax1Page)

      const card = pax1Page.locator('[data-testid="request-card"]', {
        hasText: `[E2E-${runId}] datetime-legacy-label errand`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      const timeMeta = card.locator('[data-testid="card-time-meta"]')
      await expect(timeMeta).toBeVisible()
      const timeText = await timeMeta.textContent() ?? ''

      // Must NOT display the raw relative label "Today, flexible time"
      expect(timeText).not.toBe('Today, flexible time')
      expect(timeText).not.toMatch(/^Today/)
      // Should display an inferred absolute date or at least something with "Flexible"
      expect(timeText.length).toBeGreaterThan(0)
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('expired offer next-action includes date context', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id   = await getUserId(pax1Creds().email)

    // Seed a request whose scheduled_time is well in the past (>72h ago = expired)
    const pastTime = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString() // 96h ago
    const { data: reqRow, error: reqErr } = await adminClient()
      .from('requests')
      .insert({
        requester_id: driverId,
        category: 'peer_help',
        title: `[E2E-${runId}] datetime-expired-offer peer help`,
        urgency: 'medium',
        status: 'open',
        scheduled_time: pastTime,
        flexible_time: false,
      })
      .select('id')
      .single()
    if (reqErr) throw reqErr
    const reqId = reqRow.id

    // pax1 made an offer on this now-expired request
    await seedOffer({ requestId: reqId, helperId: pax1Id, message: 'I can help' })

    try {
      await pax1Page.goto('/dashboard/offers')
      await expect(pax1Page).toHaveURL(/\/dashboard\/offers/, { timeout: 10_000 })

      const card = pax1Page.locator('[data-testid="my-offer-card"]', {
        hasText: `[E2E-${runId}] datetime-expired-offer peer help`,
      }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Next-action text should mention expiry AND include a date reference
      const cardText = await card.textContent() ?? ''
      expect(cardText).toMatch(/expired/i)
      // Should include a month name or "needed" phrasing — not just "Expired"
      expect(cardText).toMatch(/needed|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i)
    } finally {
      await cleanupRunData(runId)
    }
  })
})
