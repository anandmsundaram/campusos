/**
 * Flow 21 — Structured time picker + cancel/reset determinism
 *
 * Tests:
 *  1.  Cancel/reset: retrying same ambiguous input shows same disambiguation
 *  2.  Today specific time: selecting a future time unlocks confirm
 *  3.  Today past time: 12:00 AM is in the past → confirm stays locked + error shown
 *  4.  Tomorrow specific time: any time is valid → confirm unlocks
 *  5.  Time range: both start and end required; end must be after start
 *  6.  Later / pick date: Later alone incomplete; date + Flexible completes
 *  7.  Flexible explicit: selecting Flexible completes gate; summary says flexible
 *  8.  Meal/social full flow: Going together → Today specific time → Everyone pays for themselves
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

// Errand mock with time gate active (no scheduled_time) and payment pre-filled
function errandMock(overrides = {}) {
  return {
    category: 'errands' as const,
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
      reimbursement_type: 'paid', // pre-populates payment gate
    },
    ...overrides,
  }
}

test.describe('Structured time picker + cancel/reset', () => {

  // ── 1: Cancel/reset determinism ───────────────────────────────────────────
  test('cancel and retry shows same disambiguation every time', async ({ driverPage: page }) => {
    // Thai restaurant → ambiguous: Ride there / Food pickup / Going together
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Thai restaurant',
      is_offer: false,
      ambiguous: true,
      clarification_question: 'What are you looking for?',
      clarification_options: [
        { label: '🚗 Ride there', appended_text: 'I need a ride to a Thai restaurant' },
        { label: '🛍️ Food pickup', appended_text: 'I need someone to pick up Thai food' },
        { label: '🍽️ Going together', appended_text: 'Anyone want to go together for Thai food' },
      ],
      summary: 'Ambiguous Thai restaurant request.',
      missing_fields: [],
      structured_data: null,
    })

    await goToDashboard(page)

    // First attempt
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="disambig-option"]')).toHaveCount(3)

    // Choose "Going together"
    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Going together/ }).click()
    // Routes to confirm (meal_meetup)
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Cancel — click Edit
    await page.locator('button', { hasText: /Edit/ }).first().click()
    await expect(page.locator('[data-testid="request-textarea"]')).toBeVisible()

    // Second attempt — same text
    await page.locator('[data-testid="request-textarea"]').fill('Anyone for Thai restaurant?')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Must see disambiguation again — NOT a stale confirm card
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="disambig-option"]')).toHaveCount(3)

    // Going together must still route to Meal & Social, not Errands
    await page.locator('[data-testid="disambig-option"]').filter({ hasText: /Going together/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.getByText('Meal & Social')).toBeVisible()
    // Must NOT say "Errands"
    const cardText = await page.locator('[data-testid="confirm-post-btn"]').locator('..').locator('..').textContent()
    expect(cardText).not.toContain('Errands')
  })

  // ── 2: Today specific time — future time unlocks confirm ──────────────────
  test('Today + specific time (11:00 PM) unlocks confirm', async ({ driverPage: page }) => {
    await mockParseRequest(page, errandMock())
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Step 1: Today
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Today/ }).click()

    // Step 2: Specific time
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).click()

    // Selectors appear
    await expect(page.locator('[data-testid="time-start-hour"]')).toBeVisible({ timeout: 2_000 })

    // Confirm still disabled — no time selected yet
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select 11:00 PM — definitely in the future for any time of day
    await page.locator('[data-testid="time-start-hour"]').selectOption('11')
    await page.locator('[data-testid="time-start-minute"]').selectOption('00')
    await page.locator('[data-testid="time-start-ampm-PM"]').click()

    // Confirm now enabled — all gates satisfied
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // When row shows concrete time
    await expect(page.getByText(/Today at 11:00 PM/)).toBeVisible()
  })

  // ── 3: Today past time — 12:00 AM blocked ────────────────────────────────
  test('Today + specific time 12:00 AM (midnight, always past) keeps confirm locked', async ({ driverPage: page }) => {
    await mockParseRequest(page, errandMock())
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Today → Specific time
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Today/ }).click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).click()

    // Select 12:00 AM (midnight = 0 minutes, always in the past)
    await page.locator('[data-testid="time-start-hour"]').selectOption('12')
    await page.locator('[data-testid="time-start-minute"]').selectOption('00')
    await page.locator('[data-testid="time-start-ampm-AM"]').click()

    // Validation error must appear
    await expect(page.locator('[data-testid="time-validation-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="time-validation-error"]')).toContainText(/future/)

    // Confirm still locked
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()
  })

  // ── 4: Tomorrow specific time ─────────────────────────────────────────────
  test('Tomorrow + specific time unlocks confirm and shows concrete time in summary', async ({ driverPage: page }) => {
    await mockParseRequest(page, errandMock())
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Tomorrow → Specific time → 2:30 PM
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Tomorrow/ }).click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).click()
    await page.locator('[data-testid="time-start-hour"]').selectOption('2')
    await page.locator('[data-testid="time-start-minute"]').selectOption('30')
    await page.locator('[data-testid="time-start-ampm-PM"]').click()

    // No validation error for tomorrow
    await expect(page.locator('[data-testid="time-validation-error"]')).not.toBeVisible()

    // Confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // When row shows "Tomorrow at 2:30 PM"
    await expect(page.getByText(/Tomorrow at 2:30 PM/)).toBeVisible()
  })

  // ── 5: Time range ─────────────────────────────────────────────────────────
  test('time range: both start and end required; end must be after start', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      ...errandMock(),
      category: 'moving',
      title: 'Moving help',
      summary: 'Need moving help.',
      structured_data: {
        move_type: 'furniture',
        helpers_needed: 2,
        access_type: 'stairs',
        has_heavy_items: null,
        truck_needed: null,
        estimated_duration: null,
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need help moving furniture')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select from location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Select free payment
    await page.locator('[data-testid="payment-option"]').first().click()

    // Tomorrow → Time range
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Tomorrow/ }).click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /range/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /range/ }).click()

    // Start and end selectors appear
    await expect(page.locator('[data-testid="time-start-hour"]')).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('[data-testid="time-end-hour"]')).toBeVisible()

    // Still locked — no start/end set
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Set start: 2:00 PM
    await page.locator('[data-testid="time-start-hour"]').selectOption('2')
    await page.locator('[data-testid="time-start-minute"]').selectOption('00')
    await page.locator('[data-testid="time-start-ampm-PM"]').click()
    // Still locked — end not set
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Set end: 1:00 PM (before start → invalid)
    await page.locator('[data-testid="time-end-hour"]').selectOption('1')
    await page.locator('[data-testid="time-end-minute"]').selectOption('00')
    await page.locator('[data-testid="time-end-ampm-PM"]').click()
    // Validation error — end before start
    await expect(page.locator('[data-testid="time-validation-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Fix end: 4:00 PM (after start)
    await page.locator('[data-testid="time-end-hour"]').selectOption('4')
    await expect(page.locator('[data-testid="time-validation-error"]')).not.toBeVisible()

    // Confirm now enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // When row shows range
    const whenRow5 = page.locator('[data-testid="when-row"]')
    await expect(whenRow5).toBeVisible()
    await expect(whenRow5).toContainText('Tomorrow between 2:00 PM')
  })

  // ── 6: Later / pick date ──────────────────────────────────────────────────
  test('Later alone is incomplete; Later + date + Flexible completes time gate', async ({ driverPage: page }) => {
    await mockParseRequest(page, errandMock())
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Click Later — still incomplete (no date yet)
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Later/ }).click()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Date input must appear
    await expect(page.locator('[data-testid="time-date-input"]')).toBeVisible({ timeout: 2_000 })

    // Time mode buttons must NOT appear yet (date not picked)
    await expect(page.locator('[data-testid="time-mode"]').first()).not.toBeVisible()

    // Pick a date 7 days from now
    const future = new Date()
    future.setDate(future.getDate() + 7)
    const futureDate = future.toISOString().split('T')[0]
    await page.locator('[data-testid="time-date-input"]').fill(futureDate)

    // Time mode buttons now appear
    await expect(page.locator('[data-testid="time-mode"]').first()).toBeVisible({ timeout: 2_000 })

    // Still locked — no time mode yet
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select Flexible
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Confirm now enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // When row shows the date
    const monthDay = future.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const whenRow6 = page.locator('[data-testid="when-row"]')
    await expect(whenRow6).toBeVisible()
    await expect(whenRow6).toContainText(monthDay)
    const row6Text = await whenRow6.textContent()
    expect(row6Text).toMatch(/flexible/i)
  })

  // ── 7: Flexible explicit only ─────────────────────────────────────────────
  test('Flexible explicitly selected completes gate; summary says flexible time', async ({ driverPage: page }) => {
    await mockParseRequest(page, errandMock())
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Tomorrow → Flexible
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Tomorrow/ }).click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // When row says "Tomorrow, flexible time" — NOT "Tomorrow morning/afternoon/evening"
    const whenRow = page.locator('[data-testid="when-row"]')
    await expect(whenRow).toBeVisible()

    // Must NOT contain vague day-part labels
    const rowText = await whenRow.textContent()
    expect(rowText).toMatch(/Tomorrow.*flexible/i)
    expect(rowText).not.toMatch(/morning|afternoon|evening/i)
  })

  // ── 8: Specific time → front card shows concrete time ───────────────────────
  // Uses errands category (in DB enum). Verifies deadline_text propagates to
  // the front card after posting. meal_meetup UI is covered in spec 20.
  test('specific time posts and front card shows concrete time (not vague day-part)', async ({ driverPage: page, runId }) => {
    const originalText = `[E2E-${runId}] Food pickup for spec21`

    await mockParseRequest(page, {
      ...errandMock(),
      title: `[E2E-${runId}] Food pickup for spec21`,
      scheduled_time: null,  // time gate active
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: 'paid', // payment pre-filled
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill(originalText)
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Fill location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Rudder')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Select Tomorrow → Specific time → 6:00 PM
    await page.locator('[data-testid="time-option"]').filter({ hasText: /Tomorrow/ }).click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Specific/ }).click()
    await page.locator('[data-testid="time-start-hour"]').selectOption('6')
    await page.locator('[data-testid="time-start-minute"]').selectOption('00')
    await page.locator('[data-testid="time-start-ampm-PM"]').click()

    // Confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // When row shows concrete time, not vague
    await expect(page.locator('[data-testid="when-row"]')).toContainText('Tomorrow at 6:00 PM')

    // Post
    await page.locator('[data-testid="confirm-post-btn"]').click()
    await expect(page.getByText(/Request posted!/)).toBeVisible({ timeout: 8_000 })

    // Go to My Requests and verify front card
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /My Requests/ }).click()

    const card = page.locator('[data-testid="request-card"]').filter({ hasText: `[E2E-${runId}]` })
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Front card: time shows the concrete time (not "morning/afternoon/evening")
    await expect(card.locator('[data-testid="card-time-meta"]')).toBeVisible()
    const timeMeta = await card.locator('[data-testid="card-time-meta"]').textContent()
    expect(timeMeta).toMatch(/Tomorrow at 6:00 PM/)
    expect(timeMeta).not.toMatch(/morning|afternoon|evening/i)

    // Front card: payment meta visible
    await expect(card.locator('[data-testid="card-payment-meta"]')).toBeVisible()
  })

})
