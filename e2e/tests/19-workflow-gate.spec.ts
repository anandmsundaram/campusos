/**
 * Flow 19 — Workflow gate: payment + time slot filling before post
 *
 * Tests:
 *  1. Errand time gate: no scheduled_time → confirm disabled; add time → enabled
 *  2. Errand payment gate: no payment → confirm disabled; add payment → enabled
 *  3. Payment option labels use requester perspective ("You'll pay…")
 *  4. reimburse_plus_helper_fee: $0 helper fee is valid (confirm enables)
 *  5. reimburse_plus_helper_fee: fee amount appears in payment summary row
 *  6. No payment option contains forbidden wording ("They'll pay you/me")
 *  7. Ride passenger: cannot post without payment; selecting payment enables confirm
 *  8. Ride driver: confirm unlocks without payment slot (priceType handles it)
 *  9. Moving: both time and payment gates must be satisfied
 * 10. Peer help: payment gate required even when all critical fields are filled
 * 11. Full errand workflow: time + location + payment → confirm enabled, summary meaningful
 * 12. confirm-gate-message appears when gates unmet, disappears when all gates met
 *
 * All API calls are mocked — no real AI or Google calls in tests.
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

// ── Shared location mock (campus place, always returned for any query) ─────────
const CAMPUS_PLACE = {
  place_name: 'Kyle Field',
  formatted_address: '756 Olsen Blvd, College Station, TX 77843',
  source: 'campus_place' as const,
  needs_details: false,
  lat: 30.6109,
  lng: -96.3407,
}

test.describe('Workflow gate: payment + time slots', () => {

  // ── 1: Errand time gate ───────────────────────────────────────────────────
  test('errand time gate: confirm disabled without time, enabled after time selected', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Food pickup',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      scheduled_time: null, // Override default — triggers time gate
      summary: 'Pick up food nearby.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: 'paid', // budget default 20 → payment pre-populated
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Time question should be visible
    await expect(page.locator('[data-testid="time-question"]')).toBeVisible()

    // Select location first (required for errands)
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Kyle')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Disabled — time gate still blocking (payment is pre-populated via reimbursement_type: 'paid' + budget)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Step 1: select date bucket
    await page.locator('[data-testid="time-option"]').first().click()
    // Step 2: select Flexible (completes time gate without sub-pickers)
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Now all gates satisfied — confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 2: Errand payment gate ────────────────────────────────────────────────
  test('errand payment gate: confirm disabled without payment, enabled after payment selected', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Food pickup',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      // scheduled_time: uses default (set) — no time gate
      summary: 'Pick up food nearby.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: null, // No payment pre-fill → payment gate active
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment question visible
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Kyle')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Disabled — payment not yet selected
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select free payment option
    await page.locator('[data-testid="payment-option"]').first().click()

    // Now enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 3: Payment option labels — requester perspective ─────────────────────
  test('payment options show requester-perspective labels ("You\'ll pay…")', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Errand',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      summary: 'Need an errand run.',
      missing_fields: [],
      structured_data: { errand_type: 'food_pickup', store_or_place: 'Test', task_details: null, reimbursement_type: null },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick something up for me')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // All payment options are visible
    const opts = page.locator('[data-testid="payment-option"]')
    await expect(opts.first()).toBeVisible({ timeout: 5_000 })
    const texts = await opts.allTextContents()

    // At least one option uses "You'll pay" or "You'll reimburse" (requester perspective)
    expect(texts.some(t => t.includes("You'll"))).toBe(true)
  })

  // ── 4: reimburse_plus_helper_fee with $0 fee is valid ────────────────────
  test('reimburse_plus_helper_fee with $0 helper fee satisfies payment gate', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Errand pickup',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      summary: 'Need something picked up.',
      missing_fields: [],
      structured_data: { errand_type: 'food_pickup', store_or_place: 'Test', task_details: null, reimbursement_type: null },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick something up for me')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Kyle')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Select 'Reimburse cost + helper fee' option (last errand payment option)
    await page.locator('[data-testid="payment-option"]').filter({ hasText: /Reimburse cost \+ helper fee/ }).click()

    // Helper fee input appears
    const feeInput = page.locator('[data-testid="payment-helper-fee-input"]')
    await expect(feeInput).toBeVisible()

    // Enter $0 — should still satisfy the gate
    await feeInput.fill('0')

    // Confirm enabled — $0 is a valid helper fee (no extra, just reimbursing cost)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 5: reimburse_plus_helper_fee fee shows in payment summary ─────────────
  test('reimburse_plus_helper_fee: fee amount appears in payment summary row', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Errand pickup',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      summary: 'Need something picked up.',
      missing_fields: [],
      structured_data: { errand_type: 'food_pickup', store_or_place: 'Test', task_details: null, reimbursement_type: null },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick something up for me')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select reimburse cost + helper fee option
    await page.locator('[data-testid="payment-option"]').filter({ hasText: /Reimburse cost \+ helper fee/ }).click()

    // Enter $5 helper fee
    const feeInput = page.locator('[data-testid="payment-helper-fee-input"]')
    await expect(feeInput).toBeVisible()
    await feeInput.fill('5')

    // Payment summary row shows the fee amount
    await expect(page.locator('[data-testid="payment-label"]')).toContainText('$5')
  })

  // ── 6: No forbidden wording in any payment option ─────────────────────────
  test('payment options never contain "They\'ll pay you" or "They\'ll pay me"', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Errand',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      summary: 'Need an errand run.',
      missing_fields: [],
      structured_data: { errand_type: 'food_pickup', store_or_place: 'Test', task_details: null, reimbursement_type: null },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick something up for me')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const opts = page.locator('[data-testid="payment-option"]')
    await expect(opts.first()).toBeVisible({ timeout: 5_000 })
    const texts = await opts.allTextContents()

    for (const text of texts) {
      expect(text).not.toContain("They'll pay you")
      expect(text).not.toContain("They'll pay me")
      expect(text).not.toContain("You can earn")
      expect(text).not.toContain("earn money")
    }
  })

  // ── 7: Ride passenger payment gate ───────────────────────────────────────
  test('ride passenger: cannot post without payment; payment selection enables confirm', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Need a ride',
      origin_city: null,
      destination_city: null,
      is_driver: false,   // Passenger
      is_offer: false,
      price_type: null,   // No price_type → no payment pre-fill
      available_seats: null,
      summary: 'Need a ride downtown.',
      missing_fields: [],
      structured_data: null,
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment question visible for passenger
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Select pickup location
    const pickupPicker = page.locator('[data-testid="location-picker-pickup"]')
    await pickupPicker.locator('input').fill('Kyle')
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(pickupPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Select dropoff location
    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Kyle')
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(dropoffPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Both locations set but no payment — still disabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select payment option (split gas — first ride passenger option)
    await page.locator('[data-testid="payment-option"]').first().click()

    // Now enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 8: Ride driver: confirm unlocks without payment slot ──────────────────
  test('ride driver: confirm enables after locations set without needing payment slot', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Offering a ride',
      origin_city: null,
      destination_city: null,
      is_driver: true,   // Driver
      is_offer: false,
      available_seats: 2,
      summary: 'Offering a ride to campus.',
      missing_fields: [],
      structured_data: null,
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Offering a ride')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment question should NOT show for drivers (priceType selector handles it)
    await expect(page.locator('[data-testid="payment-question"]')).not.toBeVisible()

    // Select pickup and dropoff
    const pickupPicker = page.locator('[data-testid="location-picker-pickup"]')
    await pickupPicker.locator('input').fill('Kyle')
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(pickupPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Kyle')
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(dropoffPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Confirm enabled — driver only needs locations (priceType has a default)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 9: Moving: time gate + payment gate ───────────────────────────────────
  test('moving: both time gate and payment gate must be satisfied', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'moving',
      title: 'Help moving furniture',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      scheduled_time: null, // Time gate active
      summary: 'Need help moving furniture.',
      missing_fields: [],
      structured_data: {
        move_type: 'furniture', // No dropoff needed
        helpers_needed: 2,      // Pre-filled
        access_type: 'stairs',
        has_heavy_items: null,
        truck_needed: null,
        estimated_duration: null,
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need help moving my furniture')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Both time and payment questions visible
    await expect(page.locator('[data-testid="time-question"]')).toBeVisible()
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Select from location
    const fromPicker = page.locator('[data-testid="location-picker-pickup"]')
    await fromPicker.locator('input').fill('Kyle')
    await fromPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await fromPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(fromPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Disabled — time + payment both missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Step 1: select date bucket
    await page.locator('[data-testid="time-option"]').first().click()
    // Step 2: select time mode — Flexible completes in one click
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Still disabled — payment still missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select free payment option
    await page.locator('[data-testid="payment-option"]').first().click()

    // Now enabled — all gates satisfied
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 10: Peer help payment gate ────────────────────────────────────────────
  test('peer help: payment gate required even when all critical fields are pre-filled', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'peer_help',
      title: 'Calculus tutoring',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      // scheduled_time: default (set) — no time gate
      summary: 'Need help with calculus.',
      missing_fields: [],
      structured_data: {
        subject: 'Calc II',     // CRITICAL_FIELDS requires subject — pre-filled
        help_type: 'homework',
        is_virtual: 'false',
        session_type: 'one_time',
      },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need calculus tutoring help tonight')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Payment question visible
    await expect(page.locator('[data-testid="payment-question"]')).toBeVisible()

    // Disabled — payment not yet selected (all other fields pre-filled)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select free payment option
    await page.locator('[data-testid="payment-option"]').first().click()

    // Now enabled — payment was the only remaining gate
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── 11: Full errand workflow: all slots → enabled, meaningful summary ──────
  test('full errand workflow: time + location + payment → confirm enabled with meaningful summary', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Food pickup',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      scheduled_time: null, // Time gate active
      summary: 'Pick up food nearby.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: null, // Payment gate active
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Start disabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Kyle')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Still disabled — time + payment missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Step 1: select date bucket
    await page.locator('[data-testid="time-option"]').first().click()
    // Step 2: select time mode — Flexible completes in one click
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Still disabled — payment missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select free payment option
    await page.locator('[data-testid="payment-option"]').first().click()

    // All gates satisfied — confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()

    // Payment summary row shows meaningful text (not empty)
    const label = page.locator('[data-testid="payment-label"]')
    await expect(label).toBeVisible()
    const labelText = await label.textContent()
    expect(labelText).toBeTruthy()
    expect(labelText!.length).toBeGreaterThan(5)
  })

  // ── 12: confirm-gate-message visibility ───────────────────────────────────
  test('confirm-gate-message appears when gates unmet and disappears when all gates satisfied', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Food pickup',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      summary: 'Pick up food nearby.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: null, // Payment gate active
      },
    })
    await mockLocationSearch(page, [CAMPUS_PLACE])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up my food order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Gate message visible — confirm is locked
    await expect(page.locator('[data-testid="confirm-gate-message"]')).toBeVisible()

    // Select location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Kyle')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Gate message still visible — payment still missing
    await expect(page.locator('[data-testid="confirm-gate-message"]')).toBeVisible()

    // Select payment
    await page.locator('[data-testid="payment-option"]').first().click()

    // Gate message gone — all gates satisfied
    await expect(page.locator('[data-testid="confirm-gate-message"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

})
