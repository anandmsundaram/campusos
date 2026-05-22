/**
 * Flow 20 — UX cleanup: P0 issues from manual QA
 *
 * Tests:
 *  1.  meal_meetup category: "Going for Indian food" routes to Meal & Social, not Errands
 *  2.  Casual activity phrase does NOT trigger offer interstitial
 *  3.  Explicit offer language DOES trigger offer interstitial
 *  4.  Offer interstitial "Browse requests" link points to /dashboard (not #feed)
 *  5.  Time flow is two-step: date bucket alone does NOT satisfy gate
 *  6.  Time flow: date bucket + time mode satisfies gate
 *  7.  Errand task_details placeholder doesn't say "Milk and eggs"
 *  8.  Payment option buttons have visible selected state (border/bg change on click)
 *  9.  meal_meetup confirm card shows Meal & Social category
 * 10.  meal_meetup payment options include "Everyone pays for themselves"
 * 11.  Front card shows time + payment meta after posting (deadline_text + payment_summary)
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

const CAMPUS_PLACE = {
  place_name: 'MSC',
  formatted_address: '275 Joe Routt Blvd, College Station, TX 77840',
  source: 'campus_place' as const,
  needs_details: false,
}

test.describe('UX cleanup: P0 issues', () => {

  // ── 1: meal_meetup category routes correctly ──────────────────────────────
  test('meal_meetup: parser category routes to Meal & Social, not Errands', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'meal_meetup',
      title: 'Indian food hangout',
      is_offer: false,
      ambiguous: false,
      summary: 'Anyone want to grab Indian food?',
      missing_fields: [],
      structured_data: { restaurant_or_area: 'Indian food near campus' },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Going for Indian food, anyone want to join?')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Category label should be Meal & Social, not Errands
    const categoryRow = page.locator('text=Category').locator('..').or(
      page.locator('[data-testid="summary-text"]').locator('..')
    )
    // The category Row label shows "Meal & Social"
    await expect(page.getByText('Meal & Social', { exact: true }).first()).toBeVisible()
  })

  // ── 2: Casual activity phrase — no offer interstitial ────────────────────
  test('casual activity phrase does not trigger offer interstitial', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'meal_meetup',
      title: 'Indian food hangout',
      is_offer: true, // Parser might incorrectly flag as offer — app should override
      ambiguous: false,
      summary: 'Going for Indian food.',
      missing_fields: [],
      structured_data: { restaurant_or_area: 'Indian food' },
    })

    await goToDashboard(page)
    // Casual phrase — no explicit offer language
    await page.locator('[data-testid="request-textarea"]').fill('Going for Indian food tonight, anyone want to join?')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Should NOT show offer interstitial — no explicit offer markers in the text
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="offer-interstitial"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeVisible()
  })

  // ── 3: Explicit offer language DOES trigger offer interstitial ────────────
  test('explicit offer language triggers offer interstitial', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Running errands',
      is_offer: true,
      ambiguous: false,
      summary: 'Offering to run errands for anyone.',
      missing_fields: [],
      structured_data: { errand_type: 'other' },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I can run errands for anyone who needs help today')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Explicit offer language — should show offer interstitial
    await page.locator('[data-testid="offer-interstitial"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="offer-interstitial"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeVisible()
  })

  // ── 4: Offer interstitial Browse link points to /dashboard ───────────────
  test('offer interstitial Browse requests link points to /dashboard', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Running errands',
      is_offer: true,
      ambiguous: false,
      summary: 'Offering to run errands.',
      missing_fields: [],
      structured_data: { errand_type: 'other' },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I will run errands for anyone who needs it')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="offer-interstitial"]').waitFor({ timeout: 10_000 })

    // Browse link should point to /dashboard, not #feed
    const browseLink = page.locator('[data-testid="offer-interstitial"] a', { hasText: /Browse/ })
    await expect(browseLink).toBeVisible()
    const href = await browseLink.getAttribute('href')
    expect(href).toBe('/dashboard')
    expect(href).not.toBe('#feed')
  })

  // ── 5: Two-step time: date bucket alone does NOT satisfy gate ─────────────
  test('time flow: selecting only a date bucket does not satisfy the time gate', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Food pickup',
      is_offer: false,
      ambiguous: false,
      scheduled_time: null, // forces time gate
      summary: 'Pick up food.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: 'paid', // pre-filled payment
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('MSC')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Click ONLY the date bucket — no time mode
    await page.locator('[data-testid="time-option"]').first().click()

    // Time mode buttons should now appear (step 2)
    await expect(page.locator('[data-testid="time-mode"]').first()).toBeVisible({ timeout: 3_000 })

    // Confirm still disabled — time not complete (no time mode selected yet)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()
  })

  // ── 6: Two-step time: date + time mode satisfies gate ────────────────────
  test('time flow: date bucket + time mode together satisfy the time gate', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Food pickup',
      is_offer: false,
      ambiguous: false,
      scheduled_time: null,
      summary: 'Pick up food.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: 'paid',
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('MSC')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Step 1: date bucket
    await page.locator('[data-testid="time-option"]').first().click()
    // Step 2: select Flexible (immediately completes time gate without sub-pickers)
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Confirm now enabled — time complete + payment pre-filled + location set
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 7: Errand task_details placeholder doesn't say "Milk and eggs" ────────
  test('errand task_details placeholder does not suggest grocery shopping', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Errand run',
      is_offer: false,
      ambiguous: false,
      summary: 'Need an errand run.',
      missing_fields: ['task_details'],
      structured_data: {
        errand_type: 'grocery',
        store_or_place: 'HEB',
        task_details: null,
        reimbursement_type: null,
      },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need someone to go to HEB')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // task_details input should be visible (missing field)
    const taskInput = page.locator('[data-testid="followup-text-task_details"]')
    await expect(taskInput).toBeVisible()

    // Placeholder should NOT say "Milk and eggs" — implies grocery list shopping
    const placeholder = await taskInput.getAttribute('placeholder')
    expect(placeholder).not.toContain('Milk and eggs')
    expect(placeholder).not.toContain('milk')
    expect(placeholder).not.toContain('eggs')
  })

  // ── 8: Payment option selected state is visually obvious ─────────────────
  test('payment options show obvious selected state when clicked', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Food pickup',
      is_offer: false,
      ambiguous: false,
      summary: 'Pick up food.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Test',
        task_details: null,
        reimbursement_type: null,
      },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const firstOption = page.locator('[data-testid="payment-option"]').first()
    await expect(firstOption).toBeVisible()

    // Click the payment option
    await firstOption.click()

    // After click, the button must have a visually distinct state
    // Check for emerald/green styling classes that indicate selection
    const classAttr = await firstOption.getAttribute('class')
    expect(classAttr).toMatch(/emerald|selected|ring|bg-.*\/1[05]|border-.*\/[24]0/)
  })

  // ── 9: meal_meetup confirm card shows Meal & Social ──────────────────────
  test('meal_meetup confirm card shows correct category', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'meal_meetup',
      title: 'Dinner hangout',
      is_offer: false,
      ambiguous: false,
      summary: 'Anyone want to grab dinner?',
      missing_fields: [],
      structured_data: { restaurant_or_area: 'anywhere near campus' },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone want to grab dinner tonight?')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Confirm card should show the category as Meal & Social
    await expect(page.getByText('Meal & Social', { exact: true }).first()).toBeVisible()
  })

  // ── 10: meal_meetup payment options are social-appropriate ───────────────
  test('meal_meetup payment options include "Everyone pays for themselves"', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'meal_meetup',
      title: 'Dinner hangout',
      is_offer: false,
      ambiguous: false,
      summary: 'Anyone want to grab dinner?',
      missing_fields: [],
      structured_data: { restaurant_or_area: 'anywhere' },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone want to grab dinner tonight?')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment options should have social-appropriate options
    const opts = page.locator('[data-testid="payment-option"]')
    await expect(opts.first()).toBeVisible()
    const texts = await opts.allTextContents()

    // Should include dutch treat option
    expect(texts.some(t => /Everyone pays/i.test(t) || /dutch/i.test(t))).toBe(true)
    // Should NOT include errand/helper-specific options
    expect(texts.some(t => /reimburse/i.test(t))).toBe(false)
    expect(texts.some(t => /split gas/i.test(t))).toBe(false)
  })

  // ── 11: Front card shows time + payment meta immediately after posting ────
  test('front card shows deadline_text and payment_summary after posting', async ({ driverPage: page, runId }) => {
    const originalText = `[E2E-${runId}] Need a quick errand run`

    await mockParseRequest(page, {
      category: 'errands',
      title: `[E2E-${runId}] Quick errand`,
      is_offer: false,
      ambiguous: false,
      scheduled_time: null, // forces time gate → deadline_text will be saved
      summary: 'Need a quick errand run.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: null,
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill(originalText)
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('MSC')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Complete time: date bucket → Flexible
    await page.locator('[data-testid="time-option"]').first().click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Select free payment
    await page.locator('[data-testid="payment-option"]').first().click()

    // Post
    await page.locator('[data-testid="confirm-post-btn"]').click()
    await expect(page.getByText('Request posted!')).toBeVisible({ timeout: 8_000 })

    // Go to My Requests
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /My Requests/ }).click()

    const card = page.locator('[data-testid="request-card"]').filter({ hasText: `[E2E-${runId}]` })
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Front card should show time meta (deadline_text)
    await expect(card.locator('[data-testid="card-time-meta"]')).toBeVisible()

    // Front card should show payment meta (payment_summary)
    await expect(card.locator('[data-testid="card-payment-meta"]')).toBeVisible()
  })

})
