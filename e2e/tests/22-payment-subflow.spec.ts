/**
 * Flow 22 — Payment subflow scoping
 *
 * Payment options must be determined by resolved subflow (intentType),
 * not just the broad category.
 *
 * Tests:
 *  1. meal_meetup payment options shown after "Going together" disambiguation
 *  2. food_pickup payment options shown (no free) after "Food pickup" disambiguation
 *  3. ride_there payment options (including discuss_in_chat) after disambiguation
 *  4. Payment reset: switching subflow via cancel+retry clears previously selected mode
 *  5. Food pickup full flow: direct post → front card shows correct payment meta
 *  6. Regression: food_pickup "free" option must NOT appear after disambiguation
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

const CAMPUS_PLACE = {
  place_name: 'Rudder Tower',
  formatted_address: '401 Joe Routt Blvd, College Station, TX 77843',
  source: 'campus_place' as const,
  needs_details: false,
}

// Ambiguous Thai restaurant mock — triggers 3-option disambiguation
function thaiAmbiguousMock(runId: string) {
  return {
    category: 'errands' as const,
    title: `[E2E-${runId}] Thai restaurant`,
    is_offer: false,
    is_driver: null,           // override default true so rides payment shows
    ambiguous: true,
    clarification_question: 'What are you looking for?',
    clarification_options: [
      { label: '🚗 Ride there',     appended_text: 'I need a ride to a Thai restaurant' },
      { label: '🛍️ Food pickup',    appended_text: 'I need someone to pick up Thai food' },
      { label: '🍽️ Going together', appended_text: 'Anyone want to go together for Thai food' },
    ],
    summary: 'Unclear Thai restaurant request.',
    missing_fields: [],
    scheduled_time: null,
    structured_data: { restaurant_or_area: null },
  }
}

// Direct food pickup mock (no disambiguation) — for the full-flow test
function foodPickupMock(runId: string) {
  return {
    category: 'errands' as const,
    title: `[E2E-${runId}] Pick up Chipotle order`,
    is_offer: false,
    ambiguous: false,
    scheduled_time: null,
    summary: `Pick up a Chipotle order from campus.`,
    missing_fields: [],
    structured_data: {
      errand_type: 'food_pickup',
      store_or_place: 'Chipotle',
      task_details: null,
    },
  }
}

test.describe('Payment subflow scoping', () => {

  // ── 1: meal_meetup payment options ──────────────────────────────────────────
  test('Going Together disambiguation → meal_meetup payment options shown', async ({ driverPage: page, runId }) => {
    await mockParseRequest(page, thaiAmbiguousMock(runId))

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Select "Going together" → meal_meetup
    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Going together/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment section must be visible
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Meal-specific options must appear
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Everyone pays for themselves/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Split the bill evenly/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /I'll cover everyone/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Figure it out together/ })).toBeVisible()

    // Ride / errand-specific options must NOT appear
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Split gas/ })).not.toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Free \/ favor/ })).not.toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Reimburse/ })).not.toBeVisible()

    // Exactly 4 payment options
    await expect(page.locator('[data-testid="payment-option"]')).toHaveCount(4)
  })

  // ── 2: food_pickup payment options ──────────────────────────────────────────
  test('Food Pickup disambiguation → food_pickup payment options shown (no free)', async ({ driverPage: page, runId }) => {
    await mockParseRequest(page, thaiAmbiguousMock(runId))

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Select "Food pickup" → food_pickup_request (errands category)
    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Food pickup/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment section visible
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Food-pickup-specific options
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Order already paid/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Reimburse actual food cost only/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Reimburse food cost \+ helper fee/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Discuss in chat/ })).toBeVisible()

    // "Free / favor" must NOT appear for food pickup
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Free \/ favor/ })).not.toBeVisible()

    // Meal-specific options must NOT appear
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Everyone pays for themselves/ })).not.toBeVisible()

    // Exactly 4 payment options
    await expect(page.locator('[data-testid="payment-option"]')).toHaveCount(4)
  })

  // ── 3: ride_there payment options ───────────────────────────────────────────
  test('Ride There disambiguation → ride payment options (includes discuss_in_chat)', async ({ driverPage: page, runId }) => {
    await mockParseRequest(page, thaiAmbiguousMock(runId))
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Select "Ride there" → ride_request
    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Ride there/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment section visible (not a driver offer)
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Ride-specific options
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Split gas/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /You'll pay a fixed amount/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Free \/ favor/ })).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Discuss in chat/ })).toBeVisible()

    // Meal-specific options must NOT appear
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Everyone pays for themselves/ })).not.toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Reimburse/ })).not.toBeVisible()

    // Exactly 4 payment options for rides
    await expect(page.locator('[data-testid="payment-option"]')).toHaveCount(4)
  })

  // ── 4: Payment reset on subflow change ──────────────────────────────────────
  test('Cancel + retry with different subflow clears previously selected payment', async ({ driverPage: page, runId }) => {
    await mockParseRequest(page, thaiAmbiguousMock(runId))

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // First: select "Going together" → select meal payment → dutch_treat
    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Going together/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="payment-option"]').filter({ hasText: /Everyone pays for themselves/ }).click()
    // Verify it's selected — selected state adds bg-emerald-500/10
    const dutchBtn = page.locator('[data-testid="payment-option"]').filter({ hasText: /Everyone pays for themselves/ })
    await expect(dutchBtn).toHaveClass(/bg-emerald/)

    // Cancel → edit
    await page.locator('button', { hasText: /Edit/ }).first().click()
    await expect(page.locator('[data-testid="request-textarea"]')).toBeVisible()

    // Retry same text → same mock fires → disambig again
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // This time pick "Food pickup"
    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Food pickup/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment section shows food_pickup options
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Order already paid/ })).toBeVisible()

    // No payment option should have the selected background (bg-emerald-500/10)
    const allOpts = page.locator('[data-testid="payment-option"]')
    const count = await allOpts.count()
    for (let i = 0; i < count; i++) {
      await expect(allOpts.nth(i)).not.toHaveClass(/bg-emerald/)
    }
  })

  // ── 5: Food pickup full flow ─────────────────────────────────────────────────
  test('food_pickup direct post: reimburse_cost_only → front card shows payment meta', async ({ driverPage: page, runId }) => {
    await mockParseRequest(page, foodPickupMock(runId))
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my Chipotle order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Fill location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Payment section: food_pickup options (no free)
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()
    await expect(page.locator('[data-testid="payment-option"]').filter({ hasText: /Free \/ favor/ })).not.toBeVisible()

    // Select: Reimburse actual food cost only
    await page.locator('[data-testid="payment-option"]').filter({ hasText: /Reimburse actual food cost only/ }).click()

    // Select Tomorrow → Flexible
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Tomorrow/ }).click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // Post
    await page.locator('[data-testid="confirm-post-btn"]').click()
    await expect(page.getByText(/Request posted!/)).toBeVisible({ timeout: 8_000 })

    // Front card assertions
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /My Requests/ }).click()

    const card = page.locator('[data-testid="request-card"]').filter({ hasText: runId })
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Category badge
    await expect(card.getByText('Errands')).toBeVisible()

    // Payment meta shows reimbursement
    await expect(card.locator('[data-testid="card-payment-meta"]')).toBeVisible()
    const payMeta = await card.locator('[data-testid="card-payment-meta"]').textContent()
    expect(payMeta).toMatch(/reimburse/i)
  })

  // ── 6: Regression — free/favor option not shown for food_pickup ──────────────
  test('food_pickup disambig: Free / favor option never appears in payment list', async ({ driverPage: page, runId }) => {
    await mockParseRequest(page, thaiAmbiguousMock(runId))

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Food pickup/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Specifically verify each unwanted option is absent
    const allOptionTexts = await page.locator('[data-testid="payment-option"]').allTextContents()
    for (const text of allOptionTexts) {
      expect(text.toLowerCase()).not.toMatch(/free|favor/)
      expect(text.toLowerCase()).not.toMatch(/everyone pays for themselves/)
      expect(text.toLowerCase()).not.toMatch(/split the bill/)
      expect(text.toLowerCase()).not.toMatch(/split gas/)
    }
  })

})
