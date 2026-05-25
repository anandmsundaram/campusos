/**
 * Spec 31 — Campus scoping / tenant isolation
 *
 * Verifies that campus_id on requests and profiles enforces full tenant isolation:
 *  1. TAMU user sees TAMU requests in feed.
 *  2. TAMU user does NOT see UT Austin requests in feed.
 *  3. UT Austin user sees UT Austin requests in feed.
 *  4. UT Austin user does NOT see TAMU requests in feed.
 *  5. Cross-campus request lookup by ID returns no data (RLS blocks it).
 *  6. Cross-campus offer attempt is rejected by submit_offer_safe.
 *  7. New request from TAMU user gets TAMU campus_id server-side.
 *  8. New request from UT Austin user gets UT Austin campus_id server-side.
 *  9. Client-provided campus_id is overridden by server trigger (spoof rejected).
 * 10. Existing request creation workflow regression: still works end-to-end.
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import { mockParseRequest } from '../helpers/auth'
import {
  getUserId,
  driverCreds,
  pax1Creds,
  pax2Creds,
  seedRequest,
  cleanupRunData,
  seedTermsAcceptance,
  seedTourCompleted,
  getCampusId,
  setUserCampus,
  adminClient,
  authenticatedClient,
} from '../helpers/db'

// Minimal mock request (peer_help — no location/time gates)
function makeMock(runId: string, label: string) {
  return {
    category: 'peer_help' as const,
    title: `[E2E-31-${label}] campus isolation test`,
    origin_city: null,
    destination_city: null,
    is_driver: null,
    available_seats: null,
    scheduled_time: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    location: null,
    urgency: 'medium' as const,
    budget: null,
    is_round_trip: false,
    return_date: null,
    flexible_time: true,
    price_type: 'free' as const,
    is_airport_ride: null,
    helper_requirements: null,
    missing_fields: [],
    is_offer: false,
    ambiguous: false,
    clarification_question: null,
    clarification_options: null,
    summary: 'Campus isolation test.',
    payment_mode_unclear: false,
    structured_data: {
      subject: 'Campus isolation',
      help_type: 'homework',
      virtual_or_in_person: 'either',
      student_level: null,
      availability: null,
      reimbursement_type: 'free',
    },
  }
}

test.describe('Campus scoping / tenant isolation', () => {
  let tamuCampusId: string
  let utAustinCampusId: string
  let driverUserId: string
  let pax1UserId: string
  let pax2UserId: string

  test.beforeAll(async () => {
    ;[tamuCampusId, utAustinCampusId] = await Promise.all([
      getCampusId('tamu'),
      getCampusId('ut-austin'),
    ])
    ;[driverUserId, pax1UserId, pax2UserId] = await Promise.all([
      getUserId(driverCreds().email),
      getUserId(pax1Creds().email),
      getUserId(pax2Creds().email),
    ])
  })

  test.beforeEach(async () => {
    // All three users start on TAMU with tour + terms satisfied
    await Promise.all([
      setUserCampus(driverUserId, tamuCampusId),
      setUserCampus(pax1UserId, tamuCampusId),
      setUserCampus(pax2UserId, tamuCampusId),
      seedTourCompleted(driverUserId),
      seedTourCompleted(pax1UserId),
      seedTourCompleted(pax2UserId),
      seedTermsAcceptance(driverUserId),
      seedTermsAcceptance(pax1UserId),
      seedTermsAcceptance(pax2UserId),
    ])
  })

  test.afterEach(async ({ runId }) => {
    // Restore all users to TAMU and clean up seeded requests
    await Promise.all([
      cleanupRunData(runId),
      setUserCampus(driverUserId, tamuCampusId),
      setUserCampus(pax1UserId, tamuCampusId),
      setUserCampus(pax2UserId, tamuCampusId),
    ])
  })

  // ── 1: TAMU user sees TAMU requests ─────────────────────────────────────────
  test('TAMU user sees their campus requests in the feed', async ({ driverPage: page, runId }) => {
    const tamuReqId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      title: `[E2E-31] TAMU-only request ${runId}`,
    })

    await goToDashboard(page)

    await expect(page.locator(`[data-request-id="${tamuReqId}"]`)).toBeVisible({ timeout: 10_000 })
  })

  // ── 2: TAMU user does NOT see UT Austin requests ─────────────────────────────
  test('TAMU user does not see UT Austin requests in the feed', async ({ driverPage: page, runId }) => {
    // Temporarily assign pax2 to UT Austin, seed a UT Austin request
    await setUserCampus(pax2UserId, utAustinCampusId)
    const utReqId = await seedRequest({
      requesterId: pax2UserId,
      runId,
      category: 'peer_help',
      title: `[E2E-31] UT-Austin request ${runId}`,
    })
    // Restore pax2 to TAMU so afterEach cleanup is clean
    await setUserCampus(pax2UserId, tamuCampusId)

    await goToDashboard(page)

    // UT Austin request must NOT appear in TAMU user's feed
    await expect(page.locator(`[data-request-id="${utReqId}"]`)).not.toBeVisible()
  })

  // ── 3: UT Austin user sees UT Austin requests ────────────────────────────────
  test('UT Austin user sees their campus requests in the feed', async ({ pax2Page: page, runId }) => {
    // Assign pax2 to UT Austin and seed a UT Austin request
    await setUserCampus(pax2UserId, utAustinCampusId)
    const utReqId = await seedRequest({
      requesterId: pax2UserId,
      runId,
      category: 'peer_help',
      title: `[E2E-31] UT-visible ${runId}`,
    })

    // pax2Page uses pax2's session; with campus_id = UT Austin, RLS shows UT requests
    await goToDashboard(page)

    await expect(page.locator(`[data-request-id="${utReqId}"]`)).toBeVisible({ timeout: 10_000 })
  })

  // ── 4: UT Austin user does NOT see TAMU requests ─────────────────────────────
  test('UT Austin user does not see TAMU requests in the feed', async ({ pax2Page: page, runId }) => {
    // Seed a TAMU request as driver
    const tamuReqId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      title: `[E2E-31] TAMU-hidden ${runId}`,
    })

    // Switch pax2 to UT Austin
    await setUserCampus(pax2UserId, utAustinCampusId)
    await goToDashboard(page)

    // TAMU request must NOT appear in UT Austin user's feed
    await expect(page.locator(`[data-request-id="${tamuReqId}"]`)).not.toBeVisible()
  })

  // ── 5: Cross-campus request lookup returns no data (RLS) ─────────────────────
  test('cross-campus request ID lookup returns no data via RLS', async ({ runId }) => {
    // Seed a TAMU request
    const tamuReqId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      title: `[E2E-31] RLS block ${runId}`,
    })

    // Build an authenticated client as pax2 (UT Austin)
    await setUserCampus(pax2UserId, utAustinCampusId)
    const utClient = await authenticatedClient(pax2Creds().email, pax2Creds().password)

    // pax2 queries the TAMU request by ID — RLS should return 0 rows
    const { data, error } = await utClient
      .from('requests')
      .select('id')
      .eq('id', tamuReqId)

    // RLS returns empty array, not an error
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  // ── 6: Cross-campus offer blocked server-side ────────────────────────────────
  test('cross-campus offer attempt is rejected by submit_offer_safe', async ({ runId }) => {
    // Seed a TAMU request (driver is requester)
    const tamuReqId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      title: `[E2E-31] offer-block ${runId}`,
    })

    // pax2 on UT Austin tries to offer on the TAMU request
    await setUserCampus(pax2UserId, utAustinCampusId)
    const utClient = await authenticatedClient(pax2Creds().email, pax2Creds().password)

    const { data: result } = await utClient.rpc('submit_offer_safe', {
      p_request_id: tamuReqId,
      p_message: 'I can help!',
      p_counter_budget: null,
      p_seats_requested: 1,
    })

    expect(result?.ok).toBe(false)
    expect(result?.error).toMatch(/not available at your campus/i)
  })

  // ── 7: TAMU user's new request gets TAMU campus_id ───────────────────────────
  test('new request from TAMU user gets TAMU campus_id server-side', async ({ runId }) => {
    const title = `[E2E-31] tamu-campus-check ${runId}`
    const reqId = await seedRequest({
      requesterId: driverUserId,
      runId,
      category: 'peer_help',
      title,
    })

    const { data } = await adminClient()
      .from('requests')
      .select('campus_id')
      .eq('id', reqId)
      .single()

    expect(data?.campus_id).toBe(tamuCampusId)
  })

  // ── 8: UT Austin user's new request gets UT Austin campus_id ─────────────────
  test('new request from UT Austin user gets UT Austin campus_id server-side', async ({ runId }) => {
    // Assign pax2 to UT Austin before seeding — trigger reads profile campus
    await setUserCampus(pax2UserId, utAustinCampusId)

    const title = `[E2E-31] ut-campus-check ${runId}`
    const reqId = await seedRequest({
      requesterId: pax2UserId,
      runId,
      category: 'peer_help',
      title,
    })

    const { data } = await adminClient()
      .from('requests')
      .select('campus_id')
      .eq('id', reqId)
      .single()

    expect(data?.campus_id).toBe(utAustinCampusId)
  })

  // ── 9: Client campus_id spoof is overridden by server trigger ────────────────
  test('client-provided campus_id is overridden by server trigger', async ({ runId }) => {
    // Driver is on TAMU. Insert with campus_id explicitly set to UT Austin (spoof).
    // The BEFORE INSERT trigger rewrites campus_id from requester's profile → TAMU.
    const { data, error } = await adminClient()
      .from('requests')
      .insert({
        requester_id: driverUserId,
        category: 'peer_help',
        title: `[E2E-31] spoof ${runId}`,
        urgency: 'medium',
        status: 'open',
        campus_id: utAustinCampusId,  // attempted spoof
      })
      .select('campus_id')
      .single()

    expect(error).toBeNull()
    // Trigger must have overridden the spoofed value
    expect(data?.campus_id).toBe(tamuCampusId)
  })

  // ── 10: Regression — existing request creation still works ───────────────────
  test('existing request creation workflow still functions correctly', async ({ driverPage: page, runId }) => {
    const mock = makeMock(runId, 'regression')
    await mockParseRequest(page, mock)
    await goToDashboard(page)

    await page.locator('[data-testid="request-textarea"]').fill('I need help with campus isolation homework')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Confirm card appears
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // For peer_help with free price + flexible time the confirm button should be enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })
})
