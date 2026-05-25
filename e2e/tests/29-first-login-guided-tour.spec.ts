/**
 * Spec 29 — First-login guided tour
 *
 * Tests:
 *  1. Terms gate appears before tour (proactive, on dashboard load)
 *  2. Tour next/back navigation works correctly
 *  3. Skip stores skipped state and does not show tour again
 *  4. Finish stores completed state and does not show tour again
 *  5. QA bypass (bypass_guided_tour=true) suppresses tour
 *  6. Expired guided-tour bypass does not suppress tour
 *  7. Inactive guided-tour bypass does not suppress tour
 *  8. Tour content covers all CampusOS categories and legal positioning
 *  9. Tour does not break posting after skip/finish
 * 10. Mobile tour layout (390×844 viewport)
 */

import { test, expect } from '../helpers/fixtures'
import {
  getUserId,
  driverCreds,
  pax1Creds,
  pax2Creds,
  cleanupRunData,
  seedTermsAcceptance,
  cleanupTermsAcceptance,
  clearTermsForNewUserState,
  seedBypassUser,
  cleanupBypass,
  seedTourCompleted,
  seedTourSkipped,
  clearTourState,
  getTourMetadata,
} from '../helpers/db'
import { mockParseRequest } from '../helpers/auth'

// Minimal mock for the "does posting still work" test
const MOCK_PEER_HELP = {
  category: 'peer_help',
  title: '[E2E-29] Math tutoring needed',
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

test.describe('First-login guided tour', () => {
  let driverUserId: string
  let pax1UserId: string
  let pax2UserId: string

  test.beforeAll(async () => {
    driverUserId = await getUserId(driverCreds().email)
    pax1UserId   = await getUserId(pax1Creds().email)
    pax2UserId   = await getUserId(pax2Creds().email)
  })

  test.afterEach(async ({ runId }) => {
    await clearTourState(driverUserId)
    await clearTourState(pax1UserId)
    await clearTourState(pax2UserId)
    await cleanupTermsAcceptance(driverUserId)
    await cleanupTermsAcceptance(pax1UserId)
    await cleanupTermsAcceptance(pax2UserId)
    await cleanupBypass(driverUserId)
    await cleanupBypass(pax1UserId)
    await cleanupBypass(pax2UserId)
    await cleanupRunData(runId)
  })

  // ── 1: Terms gate appears before guided tour ──────────────────────────────────
  test('terms gate appears before guided tour on first login', async ({ driverPage: page }) => {
    // Use clearTermsForNewUserState (sets terms_accepted=null) so FirstLoginGate
    // treats this as a brand-new user and shows the proactive TermsModal.
    await clearTermsForNewUserState(driverUserId)
    await clearTourState(driverUserId)

    await page.goto('/dashboard')

    // Terms modal must appear first (proactive from FirstLoginGate)
    const termsModal = page.locator('[data-testid="terms-modal"]')
    await expect(termsModal).toBeVisible({ timeout: 10_000 })

    // Tour must NOT be visible yet
    await expect(page.locator('[data-testid="first-login-tour"]')).not.toBeVisible()

    // Accept terms
    await page.locator('[data-testid="terms-checkbox"]').check()
    await page.locator('[data-testid="terms-accept-btn"]').click()

    // Terms modal closes
    await expect(termsModal).not.toBeVisible({ timeout: 8_000 })

    // Tour appears
    const tour = page.locator('[data-testid="first-login-tour"]')
    await expect(tour).toBeVisible({ timeout: 8_000 })

    // Step 1 title
    await expect(tour.locator('[data-testid="tour-step-title"]')).toContainText(
      'CampusOS helps students'
    )
  })

  // ── 2: Tour next/back navigation ──────────────────────────────────────────────
  test('tour next/back navigation and progress indicator work', async ({ pax1Page: page }) => {
    await seedTermsAcceptance(pax1UserId)
    await clearTourState(pax1UserId)

    await page.goto('/dashboard')

    const tour = page.locator('[data-testid="first-login-tour"]')
    await expect(tour).toBeVisible({ timeout: 10_000 })

    // Step 1: progress shows "1 of 10"
    await expect(tour.locator('[data-testid="tour-progress"]')).toContainText('1 of 10')
    // Back button not visible on first step
    await expect(tour.locator('[data-testid="tour-back"]')).not.toBeVisible()

    // Navigate to step 2
    await tour.locator('[data-testid="tour-next"]').click()
    await expect(tour.locator('[data-testid="tour-step-title"]')).toContainText('Rides')
    await expect(tour.locator('[data-testid="tour-progress"]')).toContainText('2 of 10')

    // Navigate to step 3
    await tour.locator('[data-testid="tour-next"]').click()
    await expect(tour.locator('[data-testid="tour-step-title"]')).toContainText('Pickups & errands')
    await expect(tour.locator('[data-testid="tour-progress"]')).toContainText('3 of 10')

    // Go back to step 2
    await tour.locator('[data-testid="tour-back"]').click()
    await expect(tour.locator('[data-testid="tour-step-title"]')).toContainText('Rides')
    await expect(tour.locator('[data-testid="tour-progress"]')).toContainText('2 of 10')
  })

  // ── 3: Skip stores skipped state and does not show again ─────────────────────
  test('skip stores skipped_at and suppresses tour on refresh', async ({ pax2Page: page }) => {
    await seedTermsAcceptance(pax2UserId)
    await clearTourState(pax2UserId)

    await page.goto('/dashboard')

    const tour = page.locator('[data-testid="first-login-tour"]')
    await expect(tour).toBeVisible({ timeout: 10_000 })

    // Click Skip
    await tour.locator('[data-testid="tour-skip"]').click()
    await expect(tour).not.toBeVisible({ timeout: 8_000 })

    // Verify DB state
    const meta = await getTourMetadata(pax2UserId)
    expect(meta?.skippedAt).not.toBeNull()
    expect(meta?.completedAt).toBeNull()

    // Refresh — tour must not reappear
    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })
    await expect(page.locator('[data-testid="first-login-tour"]')).not.toBeVisible()
  })

  // ── 4: Finish stores completed state and does not show again ─────────────────
  test('finishing all steps stores completed_at and suppresses tour on refresh', async ({ driverPage: page }) => {
    await seedTermsAcceptance(driverUserId)
    await clearTourState(driverUserId)

    await page.goto('/dashboard')

    const tour = page.locator('[data-testid="first-login-tour"]')
    await expect(tour).toBeVisible({ timeout: 10_000 })

    // Click through all 10 steps
    for (let i = 0; i < 9; i++) {
      await tour.locator('[data-testid="tour-next"]').click()
    }

    // On step 10 the Finish button should be visible
    await expect(tour.locator('[data-testid="tour-finish"]')).toBeVisible()
    await tour.locator('[data-testid="tour-finish"]').click()
    await expect(tour).not.toBeVisible({ timeout: 8_000 })

    // Verify DB state
    const meta = await getTourMetadata(driverUserId)
    expect(meta?.completedAt).not.toBeNull()
    expect(meta?.skippedAt).toBeNull()

    // Refresh — tour must not reappear
    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })
    await expect(page.locator('[data-testid="first-login-tour"]')).not.toBeVisible()
  })

  // ── 5: QA bypass (bypass_guided_tour=true) suppresses tour ───────────────────
  test('QA bypass with bypass_guided_tour=true suppresses guided tour', async ({ pax1Page: page }) => {
    await seedTermsAcceptance(pax1UserId)
    await clearTourState(pax1UserId)
    await seedBypassUser(pax1UserId, {
      bypassTermsAcceptance: false,
      bypassGuidedTour:      true,
    })

    await page.goto('/dashboard')
    await page.reload()
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    await expect(page.locator('[data-testid="first-login-tour"]')).not.toBeVisible()
  })

  // ── 6: Expired guided-tour bypass does not suppress tour ─────────────────────
  test('expired bypass_guided_tour does not suppress tour', async ({ pax2Page: page }) => {
    await seedTermsAcceptance(pax2UserId)
    await clearTourState(pax2UserId)
    await seedBypassUser(pax2UserId, {
      bypassTermsAcceptance: false,
      bypassGuidedTour:      true,
      expiresAt:             new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    })

    await page.goto('/dashboard')
    await page.reload()
    // Tour should still appear because bypass is expired
    const tour = page.locator('[data-testid="first-login-tour"]')
    await expect(tour).toBeVisible({ timeout: 10_000 })
    // Clean up tour before afterEach
    await tour.locator('[data-testid="tour-skip"]').click()
  })

  // ── 7: Inactive guided-tour bypass does not suppress tour ─────────────────────
  test('inactive bypass_guided_tour does not suppress tour', async ({ driverPage: page }) => {
    await seedTermsAcceptance(driverUserId)
    await clearTourState(driverUserId)
    await seedBypassUser(driverUserId, {
      bypassTermsAcceptance: false,
      bypassGuidedTour:      true,
      isActive:              false,
    })

    await page.goto('/dashboard')
    await page.reload()
    const tour = page.locator('[data-testid="first-login-tour"]')
    await expect(tour).toBeVisible({ timeout: 10_000 })
    await tour.locator('[data-testid="tour-skip"]').click()
  })

  // ── 8: Tour content covers all categories and legal positioning ───────────────
  test('tour content covers all categories and uses correct legal wording', async ({ pax1Page: page }) => {
    await seedTermsAcceptance(pax1UserId)
    await clearTourState(pax1UserId)

    await page.goto('/dashboard')

    const tour = page.locator('[data-testid="first-login-tour"]')
    await expect(tour).toBeVisible({ timeout: 10_000 })

    // Navigate through all 10 steps, accumulating text from each
    let allContent = ''
    for (let i = 0; i < 9; i++) {
      allContent += (await tour.textContent()) ?? ''
      await tour.locator('[data-testid="tour-next"]').click()
    }
    allContent += (await tour.textContent()) ?? ''

    const body = allContent

    // Required categories
    expect(body).toMatch(/Rides/i)
    expect(body).toMatch(/Pickups|errands/i)
    expect(body).toMatch(/Moving help/i)
    expect(body).toMatch(/Peer help/i)
    expect(body).toMatch(/Borrow/i)
    expect(body).toMatch(/Meal|Social/i)

    // Legal positioning
    expect(body).toMatch(/peer-to-peer coordination/i)
    expect(body).toMatch(/Payments are external during beta/i)

    // Forbidden wording (must NOT be present)
    expect(body).not.toMatch(/CampusOS provides rides/i)
    expect(body).not.toMatch(/CampusOS employs/i)
    expect(body).not.toMatch(/CampusOS processes payments/i)

    // Finish to clean up
    await tour.locator('[data-testid="tour-finish"]').click()
  })

  // ── 9: Tour does not break posting after skip/finish ─────────────────────────
  test('posting a request works normally after tour is skipped', async ({ pax2Page: page }) => {
    await seedTermsAcceptance(pax2UserId)
    await seedTourSkipped(pax2UserId, 2)
    await mockParseRequest(page, MOCK_PEER_HELP)

    await page.goto('/dashboard')
    await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })

    // Tour must not be showing
    await expect(page.locator('[data-testid="first-login-tour"]')).not.toBeVisible()

    // Posting should work normally
    await page.locator('[data-testid="request-textarea"]').fill('I need math tutoring help')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Tour still not visible during posting
    await expect(page.locator('[data-testid="first-login-tour"]')).not.toBeVisible()
  })

  // ── 10: Mobile tour layout ────────────────────────────────────────────────────
  test('tour is usable on mobile viewport (390×844)', async ({ browser }) => {
    // Use pax1 (cleanest state after afterEach reset from previous test)
    const ctx = await browser.newContext({
      storageState: require('path').join(__dirname, '../../playwright/.auth/pax1.json'),
      viewport: { width: 390, height: 844 },
    })
    const page = await ctx.newPage()

    try {
      await seedTermsAcceptance(pax1UserId)
      await clearTourState(pax1UserId)

      await page.goto('/dashboard')

      const tour = page.locator('[data-testid="first-login-tour"]')
      await expect(tour).toBeVisible({ timeout: 10_000 })

      // No horizontal scrollbar
      const bodyWidth  = await page.evaluate(() => document.body.scrollWidth)
      const viewWidth  = await page.evaluate(() => window.innerWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 5) // 5px tolerance

      // Next, Skip buttons visible and tappable
      await expect(tour.locator('[data-testid="tour-next"]')).toBeVisible()
      await expect(tour.locator('[data-testid="tour-skip"]')).toBeVisible()

      // Navigate through a few steps
      await tour.locator('[data-testid="tour-next"]').click()
      await expect(tour.locator('[data-testid="tour-progress"]')).toContainText('2 of 10')
      await tour.locator('[data-testid="tour-next"]').click()
      await expect(tour.locator('[data-testid="tour-progress"]')).toContainText('3 of 10')

      // Back button visible after first step
      await expect(tour.locator('[data-testid="tour-back"]')).toBeVisible()

      // Skip works on mobile
      await tour.locator('[data-testid="tour-skip"]').click()
      await expect(tour).not.toBeVisible({ timeout: 8_000 })
    } finally {
      await ctx.close()
    }
  })
})
