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
  authenticatedClient,
} from '../helpers/db'

test.describe('Completion flow', () => {
  test('mark-complete button transitions card to Completed ✓', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Seed: ride 30 min in the past — past scheduled_time but within the 1h auto-complete
    // grace window. Use 2 available seats so accepting 1 keeps status='open' (not 'matched'),
    // which puts the card in the Past section without triggering auto-complete on page load.
    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId,
      availableSeats: 2,
      budget: 20,
      scheduledOffsetSeconds: -1800, // 30 min in the past — within grace window
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

      // Register the response listener BEFORE clicking so we don't miss it if
      // the RPC completes before Playwright re-checks.
      const rpcDone = driverPage.waitForResponse(
        r => r.url().includes('complete_request_safe'),
        { timeout: 15_000 },
      )
      await completeBtn.click()

      // Wait for the server to confirm the completion RPC succeeded.
      // This ensures router.refresh() has been called and the server-side
      // render of the updated status will follow — preventing a dangling
      // server request from bleeding into the next test.
      const rpcResponse = await rpcDone
      expect(rpcResponse.status()).toBe(200)

      // After RPC succeeds, router.refresh() updates the page data.
      // Give a generous window for the RSC re-render in a loaded dev server.
      await expect(card.getByText('Completed ✓')).toBeVisible({ timeout: 20_000 })
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
      // complete_request_safe uses auth.uid() — must sign in as the requester
      const db = await authenticatedClient(driverCreds().email, driverCreds().password)

      // First completion
      const { data: r1 } = await db.rpc('complete_request_safe', { p_request_id: requestId })
      expect(r1?.ok).toBe(true)

      // Second completion — should still return ok:true (already completed)
      const { data: r2 } = await db.rpc('complete_request_safe', { p_request_id: requestId })
      expect(r2?.ok).toBe(true)

      // DB state (admin client is fine for reads)
      const { adminClient: adminCl } = await import('../helpers/db')
      const { data: req } = await adminCl().from('requests').select('status').eq('id', requestId).single()
      expect(req?.status).toBe('completed')
    } finally {
      await cleanupRunData(`${runId}-idem`)
    }
  })
})
