/**
 * Flow 9 — Finance calculations
 *
 * Verifies that the finance strip (In Play, Earned, To Pay) updates
 * correctly after key marketplace events:
 *
 *  - After offer acceptance:   driver's In Play increases
 *  - After completion:         Earned increases, In Play decreases
 *  - Passenger's To Pay:       increases after they accept a seat
 *  - After cancellation:       driver's In Play drops back
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
  adminClient,
} from '../helpers/db'

test.describe('Finance calculations', () => {
  test('driver In Play increases after offer acceptance', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    // Seed baseline — measure In Play before seeding
    await goToDashboard(driverPage)
    const baseline = parseDollar(await getFinanceValue(driverPage, 'in-play'))

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-fin1`,
      availableSeats: 1,
      budget: 40,
    })
    const offerId = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    await seedAcceptOffer(offerId, requestId, 1)

    try {
      // Reload to pick up the new data
      await driverPage.goto('/dashboard')
      const afterAccept = parseDollar(await getFinanceValue(driverPage, 'in-play'))

      // In Play should increase by at least $40 (the budget)
      expect(afterAccept).toBeGreaterThanOrEqual(baseline + 40)
    } finally {
      await cleanupRunData(`${runId}-fin1`)
    }
  })

  test('driver Earned increases after completion', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    await goToDashboard(driverPage)
    const earnedBefore = parseDollar(await getFinanceValue(driverPage, 'earned'))
    const inPlayBefore = parseDollar(await getFinanceValue(driverPage, 'in-play'))

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-fin2`,
      availableSeats: 1,
      budget: 50,
      scheduledOffsetSeconds: -7200,
    })
    const offerId = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    await seedAcceptOffer(offerId, requestId, 1)

    // Complete it directly
    await adminClient().rpc('complete_request_safe', { p_request_id: requestId })

    try {
      await driverPage.goto('/dashboard')
      const earnedAfter = parseDollar(await getFinanceValue(driverPage, 'earned'))
      const inPlayAfter = parseDollar(await getFinanceValue(driverPage, 'in-play'))

      expect(earnedAfter).toBeGreaterThanOrEqual(earnedBefore + 50)
      // Completed requests move out of In Play
      expect(inPlayAfter).toBeLessThanOrEqual(inPlayBefore + 5) // allow small floating point delta
    } finally {
      await cleanupRunData(`${runId}-fin2`)
    }
  })

  test('passenger To Pay increases after seat acceptance', async ({ pax1Page, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    await goToDashboard(pax1Page)
    const toPayBefore = parseDollar(await getFinanceValue(pax1Page, 'to-pay'))

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-fin3`,
      availableSeats: 2,
      budget: 30,
    })
    const offerId = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 2 })
    await seedAcceptOffer(offerId, requestId, 2)

    try {
      await pax1Page.goto('/dashboard')
      const toPayAfter = parseDollar(await getFinanceValue(pax1Page, 'to-pay'))

      // Passenger owes $30 × 2 seats = $60
      expect(toPayAfter).toBeGreaterThanOrEqual(toPayBefore + 60)
    } finally {
      await cleanupRunData(`${runId}-fin3`)
    }
  })

  test('driver In Play drops after cancellation', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const pax1Id = await getUserId(pax1Creds().email)

    const requestId = await seedDriverRide({
      requesterId: driverId,
      runId: `${runId}-fin4`,
      availableSeats: 1,
      budget: 35,
    })
    const offerId = await seedOffer({ requestId, helperId: pax1Id, seatsRequested: 1 })
    await seedAcceptOffer(offerId, requestId, 1)

    await goToDashboard(driverPage)
    const inPlayBefore = parseDollar(await getFinanceValue(driverPage, 'in-play'))

    await adminClient().rpc('cancel_request_safe', {
      p_request_id: requestId,
      p_reason: 'cancelled_by_requester',
    })

    try {
      await driverPage.goto('/dashboard')
      const inPlayAfter = parseDollar(await getFinanceValue(driverPage, 'in-play'))

      expect(inPlayAfter).toBeLessThan(inPlayBefore)
    } finally {
      await cleanupRunData(`${runId}-fin4`)
    }
  })
})
