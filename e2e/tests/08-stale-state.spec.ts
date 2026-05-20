/**
 * Flow 8 — Stale-state protection
 *
 * Simulates two browser tabs (or two users) acting on the same request
 * simultaneously:
 *
 *  - Tab A accepts offer-1 → fills the last seat
 *  - Tab B (same driver, already showing the offers modal) tries to accept
 *    offer-2 → must receive a graceful error rather than silently over-booking
 *
 * Also tests:
 *  - Accepting an offer on an already-completed request fails gracefully
 */

import { test, expect, goToDashboard, goToMyRequests, requestCard } from '../helpers/fixtures'
import {
  seedDriverRide,
  seedOffer,
  seedAcceptOffer,
  getUserId,
  driverCreds,
  pax1Creds,
  pax2Creds,
  cleanupRunData,
} from '../helpers/db'

test.describe('Stale-state protection', () => {
  test('tab B cannot fill already-filled seat — graceful error', async ({ driverPage, pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)
    const pax2Id = await getUserId(pax2Creds().email)

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-stale`,
      availableSeats: 1,
      budget: 20,
    })
    const offer1Id = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    const offer2Id = await seedOffer({ requestId, helperId: pax2Id, seatsRequested: 1 })

    try {
      // Both "tabs" open the offers modal simultaneously (we open it on one page
      // and then accept offer-1 from DB to simulate the other tab acting first)
      await goToDashboard(driverPage)
      await goToMyRequests(driverPage)

      const card = requestCard(driverPage, requestId)
      await expect(card).toBeVisible({ timeout: 10_000 })
      await card.locator('[data-testid="view-offers-btn"]').click()

      const modal = driverPage.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal.locator('[data-testid="modal-accept-btn"]')).toHaveCount(2, { timeout: 8_000 })

      // "Tab A" accepts offer-1 directly via DB — seat is now full
      await seedAcceptOffer(offer1Id, requestId, 1)

      // "Tab B" (same driverPage modal, now stale) tries to accept offer-2
      await modal.locator('[data-testid="modal-accept-btn"]').last().click()

      // Must show a graceful error — not a blank page or a JS crash
      await expect(modal.locator('[data-testid="modal-action-error"]')).toBeVisible({ timeout: 8_000 })
      const errText = await modal.locator('[data-testid="modal-action-error"]').textContent()
      expect(errText).toMatch(/seat|full|available|no longer/i)
    } finally {
      await cleanupRunData(`${runId}-stale`)
    }
  })

  test('accepting an offer on a completed request returns graceful error', async ({ runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)
    const pax2Id = await getUserId(pax2Creds().email)

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-stale2`,
      availableSeats: 2,
      budget: 20,
      scheduledOffsetSeconds: -7200,
    })
    const offer1Id = await seedOffer({ requestId, helperId: pax1Id })
    await seedAcceptOffer(offer1Id, requestId, 1)

    // Mark completed
    const { adminClient } = await import('../helpers/db')
    const db = adminClient()
    await db.from('requests').update({ status: 'completed' }).eq('id', requestId)

    const offer2Id = await seedOffer({ requestId, helperId: pax2Id })

    try {
      const { data: result } = await db.rpc('accept_offer_atomic', {
        p_offer_id: offer2Id,
        p_accepted_by: driverId,
      })

      expect(result?.ok).toBe(false)
      expect(result?.error).toMatch(/complet|no longer/i)
    } finally {
      await cleanupRunData(`${runId}-stale2`)
    }
  })
})
