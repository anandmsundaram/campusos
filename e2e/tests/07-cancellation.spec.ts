/**
 * Flow 7 — Cancellation flow
 *
 * There is no cancel button in the current UI, so these tests exercise
 * the cancel_request_safe RPC directly and then verify the UI reflects
 * the cancelled state correctly (status badge, finance counters).
 *
 * Tests:
 *  - cancel_request_safe transitions status to 'cancelled'
 *  - Finance "In Play" drops after cancellation
 *  - Cancelled request cannot be completed (RPC guard)
 *  - Idempotent: second cancel returns ok:true
 */

import { test, expect, goToDashboard, getFinanceValue, parseDollar } from '../helpers/fixtures'
import {
  seedDriverRide,
  seedOffer,
  seedAcceptOffer,
  getUserId,
  driverCreds,
  pax1Creds,
  cleanupRunData,
} from '../helpers/db'

test.describe('Cancellation flow', () => {
  test('cancel_request_safe transitions status and RPC blocks subsequent completion', async ({ runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const { adminClient } = await import('../helpers/db')
    const db = adminClient()

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-cancel`,
      availableSeats: 1,
      budget: 20,
    })

    try {
      // Cancel it
      const { data: cancelResult } = await db.rpc('cancel_request_safe', {
        p_request_id: requestId,
        p_reason: 'cancelled_by_requester',
      })
      expect(cancelResult?.ok).toBe(true)

      // DB state
      const { data: req } = await db.from('requests').select('status, cancellation_reason').eq('id', requestId).single()
      expect(req?.status).toBe('cancelled')
      expect(req?.cancellation_reason).toBe('cancelled_by_requester')

      // Attempt to complete a cancelled request — must fail
      const { data: completeResult } = await db.rpc('complete_request_safe', { p_request_id: requestId })
      expect(completeResult?.ok).toBe(false)
      expect(completeResult?.error).toMatch(/cancel/i)
    } finally {
      await cleanupRunData(`${runId}-cancel`)
    }
  })

  test('finance In Play drops after cancellation of accepted offer', async ({
    driverPage,
    runId,
  }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Seed a ride with an accepted offer ($20, 1 seat) → In Play should include $20 for driver
    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-fin`,
      availableSeats: 1,
      budget: 20,
    })
    const offerId = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    await seedAcceptOffer(offerId, requestId, 1)

    try {
      await goToDashboard(driverPage)

      // Capture In Play before cancel
      const inPlayBefore = parseDollar(await getFinanceValue(driverPage, 'in-play'))

      // Cancel via RPC (no UI button exists)
      const { adminClient } = await import('../helpers/db')
      const db = adminClient()
      await db.rpc('cancel_request_safe', {
        p_request_id: requestId,
        p_reason: 'cancelled_by_requester',
      })

      // Reload dashboard to get updated finance strip
      await driverPage.goto('/dashboard')

      const inPlayAfter = parseDollar(await getFinanceValue(driverPage, 'in-play'))

      // In Play should be lower after cancellation
      expect(inPlayAfter).toBeLessThan(inPlayBefore)
    } finally {
      await cleanupRunData(`${runId}-fin`)
    }
  })

  test('cancel_request_safe is idempotent', async ({ runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const { adminClient } = await import('../helpers/db')
    const db = adminClient()

    const requestId = await seedDriverRide({ requesterId: driverId, runId: `${runId}-idem2`, budget: 20 })

    try {
      await db.rpc('cancel_request_safe', { p_request_id: requestId, p_reason: 'cancelled_by_requester' })
      const { data: r2 } = await db.rpc('cancel_request_safe', { p_request_id: requestId, p_reason: 'cancelled_by_requester' })
      expect(r2?.ok).toBe(true)
    } finally {
      await cleanupRunData(`${runId}-idem2`)
    }
  })
})
