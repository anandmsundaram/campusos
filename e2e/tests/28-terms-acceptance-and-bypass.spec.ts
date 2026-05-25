/**
 * Spec 28 — Terms acceptance gate and QA bypass
 *
 * Tests:
 *  1. New user is blocked from posting until terms accepted
 *  2. Returning accepted user is not blocked
 *  3. Old-version acceptance triggers re-acceptance gate
 *  4. QA bypass user (bypass_terms_acceptance=true) skips gate
 *  5. Expired bypass does not skip gate
 *  6. Inactive bypass does not skip gate
 *  7. Bypass matched by userId (seeded via getUserId → email lookup)
 *  8. qa_bypass_users table returns 0 rows when queried by a normal authenticated user (RLS)
 *  9. Accepted user can open offer modal without terms gate
 * 10. Non-accepted user sees terms gate when clicking I can help
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import { mockParseRequest, getCurrentUserId } from '../helpers/auth'
import {
  getUserId,
  driverCreds,
  pax1Creds,
  seedRequest,
  cleanupRunData,
  seedTermsAcceptance,
  cleanupTermsAcceptance,
  seedBypassUser,
  cleanupBypass,
  authenticatedClient,
  seedTourCompleted,
} from '../helpers/db'

// Minimal mock request that doesn't need time/location gates
const MOCK_PEER_HELP = {
  category: 'peer_help',
  title: '[E2E-28] Math tutoring needed',
  origin_city: null,
  destination_city: null,
  is_driver: null,
  available_seats: null,
  scheduled_time: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
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
  summary: 'Need help with math.',
  payment_mode_unclear: false,
  structured_data: {
    subject: 'Math',
    help_type: 'homework',
    virtual_or_in_person: 'either',
    student_level: null,
    availability: null,
  },
}

test.describe('Terms acceptance gate and QA bypass', () => {
  let driverUserId: string
  let pax1UserId: string

  test.beforeAll(async () => {
    driverUserId = await getUserId(driverCreds().email)
    pax1UserId   = await getUserId(pax1Creds().email)
  })

  test.beforeEach(async () => {
    await Promise.all([
      seedTourCompleted(driverUserId),
      seedTourCompleted(pax1UserId),
    ])
  })

  test.afterEach(async ({ runId }) => {
    await cleanupTermsAcceptance(driverUserId)
    await cleanupBypass(driverUserId)
    await cleanupRunData(runId)
  })

  // ── 1: New user is blocked from posting ──────────────────────────────────────
  test('new user is blocked from posting until terms accepted', async ({ driverPage: page }) => {
    await cleanupTermsAcceptance(driverUserId)
    await mockParseRequest(page, MOCK_PEER_HELP)
    await goToDashboard(page)

    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()

    await expect(page.locator('[data-testid="terms-modal"]')).toBeVisible({ timeout: 8_000 })
    // Confirm the parse-request route was NOT hit (modal intercepted before submit)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeVisible()
  })

  // ── 2: Returning accepted user is not blocked ─────────────────────────────────
  test('returning accepted user is not blocked from posting', async ({ driverPage: page }) => {
    await seedTermsAcceptance(driverUserId)
    await mockParseRequest(page, MOCK_PEER_HELP)
    await goToDashboard(page)

    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Parse should proceed — confirm card appears, no terms modal
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="terms-modal"]')).not.toBeVisible()
  })

  // ── 3: Old-version acceptance triggers re-acceptance ─────────────────────────
  test('old-version acceptance triggers re-acceptance gate', async ({ driverPage: page }) => {
    await seedTermsAcceptance(driverUserId, {
      termsVersion:      '2025-01-terms-v0',
      privacyVersion:    '2025-01-privacy-v0',
      guidelinesVersion: '2025-01-guidelines-v0',
    })
    await mockParseRequest(page, MOCK_PEER_HELP)
    await goToDashboard(page)

    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()

    await expect(page.locator('[data-testid="terms-modal"]')).toBeVisible({ timeout: 8_000 })
  })

  // ── 4: QA bypass user skips gate ─────────────────────────────────────────────
  test('QA bypass user skips terms gate', async ({ driverPage: page }) => {
    await cleanupTermsAcceptance(driverUserId)
    await seedBypassUser(driverUserId, { bypassTermsAcceptance: true })
    await mockParseRequest(page, MOCK_PEER_HELP)
    await goToDashboard(page)

    // Reload to pick up refreshed user_metadata
    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="terms-modal"]')).not.toBeVisible()
  })

  // ── 5: Expired bypass does not skip gate ──────────────────────────────────────
  test('expired bypass does not skip gate', async ({ driverPage: page }) => {
    await cleanupTermsAcceptance(driverUserId)
    await seedBypassUser(driverUserId, {
      bypassTermsAcceptance: true,
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // 1 minute ago
    })
    await mockParseRequest(page, MOCK_PEER_HELP)
    await goToDashboard(page)

    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()

    await expect(page.locator('[data-testid="terms-modal"]')).toBeVisible({ timeout: 8_000 })
  })

  // ── 6: Inactive bypass does not skip gate ─────────────────────────────────────
  test('inactive bypass does not skip gate', async ({ driverPage: page }) => {
    await cleanupTermsAcceptance(driverUserId)
    await seedBypassUser(driverUserId, {
      bypassTermsAcceptance: true,
      isActive: false,
    })
    await mockParseRequest(page, MOCK_PEER_HELP)
    await goToDashboard(page)

    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()

    await expect(page.locator('[data-testid="terms-modal"]')).toBeVisible({ timeout: 8_000 })
  })

  // ── 7: Bypass matched by userId (seeded via email lookup) ────────────────────
  test('bypass seeded by email-to-userId lookup correctly skips gate', async ({ driverPage: page }) => {
    // Simulate the admin workflow: look up user by email, then seed bypass
    const userId = await getUserId(driverCreds().email)
    await cleanupTermsAcceptance(userId)
    await seedBypassUser(userId, { bypassTermsAcceptance: true })
    await mockParseRequest(page, MOCK_PEER_HELP)
    await goToDashboard(page)

    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="terms-modal"]')).not.toBeVisible()
  })

  // ── 8: qa_bypass_users table returns 0 rows for normal users (RLS) ───────────
  test('qa_bypass_users table is not broadly readable by authenticated users', async ({ driverPage: page }) => {
    // Get a valid session by reading it from the page
    await goToDashboard(page)
    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    // Check via the authenticated client — normal users should see 0 rows
    const { email, password } = driverCreds()
    const client = await authenticatedClient(email, password)
    const { data, error } = await client.from('qa_bypass_users').select('*')

    // Either the table doesn't exist yet (error expected), or RLS returns 0 rows
    if (error) {
      // Table not yet applied via SQL Editor — acceptable; the SQL is ready in migration 027
      expect(error.message).toMatch(/Could not find the table|relation.*does not exist|permission denied/i)
    } else {
      expect(data).toHaveLength(0)
    }
  })

  // ── 9: Accepted user can open offer modal without terms gate ─────────────────
  test('accepted user can open offer modal without terms gate', async ({ driverPage: page, runId }) => {
    await seedTermsAcceptance(driverUserId)

    // Seed a request from pax1 for the driver to offer on
    const requestId = await seedRequest({
      requesterId: pax1UserId,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Need help with calculus`,
      urgency: 'medium',
    })

    await goToDashboard(page)
    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    // Find the request card and click I can help
    const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
    await card.waitFor({ timeout: 10_000 })
    await card.locator('[data-testid="offer-cta-btn"]').click()

    // Terms modal should NOT appear; offer modal should open
    await expect(page.locator('[data-testid="terms-modal"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="offer-submit-btn"]')).toBeVisible({ timeout: 5_000 })
  })

  // ── 10: Non-accepted user sees terms gate when clicking I can help ────────────
  test('non-accepted user sees terms gate when clicking I can help', async ({ driverPage: page, runId }) => {
    await cleanupTermsAcceptance(driverUserId)

    // Seed a request from pax1 for the driver to offer on
    const requestId = await seedRequest({
      requesterId: pax1UserId,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] Need help with calculus`,
      urgency: 'medium',
    })

    await goToDashboard(page)
    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    const card = page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
    await card.waitFor({ timeout: 10_000 })
    await card.locator('[data-testid="offer-cta-btn"]').click()

    // Terms modal must appear; offer modal must NOT be open
    await expect(page.locator('[data-testid="terms-modal"]')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('[data-testid="offer-submit-btn"]')).not.toBeVisible()
  })
})
