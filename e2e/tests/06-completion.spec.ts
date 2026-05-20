/**
 * Flow 6 — Completion flow
 *
 * Tests:
 *  - A matched ride in the past section shows "Mark complete"
 *  - Clicking it transitions status to "Completed ✓"
 *  - Calling complete_request_safe twice is idempotent (no error)
 */

import { test, expect, goToDashboard, goToMyRequests, requestCard } from '../helpers/fixtures'
import {
  seedDriverRide,
  seedOffer,
  seedAcceptOffer,
  getUserId,
  driverCreds,
  pax1Creds,
  cleanupRunData,
} from '../helpers/db'

test.describe('Completion flow', () => {
  test('mark-complete button transitions card to Completed ✓', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Seed: ride that happened 2 hours ago (past the 1h grace window)
    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId,
      availableSeats: 1,
      budget: 20,
      scheduledOffsetSeconds: -7200, // 2h in the past
    })

    const offerId = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    await seedAcceptOffer(offerId, requestId, 1)

    try {
      await goToDashboard(driverPage)
      await goToMyRequests(driverPage)

      // The ride is in the past section — page auto-refreshes see it there
      // after the 1h grace period. Force a fresh load.
      await driverPage.goto('/dashboard')
      await driverPage.getByRole('button', { name: /My Requests/ }).click()

      // Past section should contain the card
      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 10_000 })

      // "Mark complete" button should be visible
      const completeBtn = card.locator('[data-testid="mark-complete-btn"]')
      await expect(completeBtn).toBeVisible({ timeout: 8_000 })
      await completeBtn.click()

      // After clicking, the button disappears and "Completed ✓" appears
      await expect(card.getByText('Completed ✓')).toBeVisible({ timeout: 10_000 })
      await expect(completeBtn).not.toBeVisible()
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('complete_request_safe is idempotent — calling twice returns ok:true', async ({ runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-idem`,
      availableSeats: 1,
      budget: 20,
      scheduledOffsetSeconds: -7200,
    })
    const offerId = await seedOffer({ requestId, helperId: pax1Id })
    await seedAcceptOffer(offerId, requestId, 1)

    try {
      const { adminClient } = await import('../helpers/db')
      const db = adminClient()

      // First completion
      const { data: r1 } = await db.rpc('complete_request_safe', { p_request_id: requestId })
      expect(r1?.ok).toBe(true)

      // Second completion — should still return ok:true (already completed)
      const { data: r2 } = await db.rpc('complete_request_safe', { p_request_id: requestId })
      expect(r2?.ok).toBe(true)

      // DB state
      const { data: req } = await db.from('requests').select('status').eq('id', requestId).single()
      expect(req?.status).toBe('completed')
    } finally {
      await cleanupRunData(`${runId}-idem`)
    }
  })
})
