/**
 * Spec 30 — Ride intent routing, seat inference, location gating, and confirm-gate messaging
 *
 * Tests:
 *  1. "I need a ride to Walmart" routes to Rides, not Errands
 *  2. "along with my friend" infers passengers_count=2 and shows "Seats needed: 2"
 *  3. Confirm is disabled when no locations are selected for a ride
 *  4. Confirm-gate message lists specific missing fields (not generic)
 *  5. Ride request does NOT require errand_type or task_details
 *  6. Category label and title are both ride-consistent (no Errands/Ride mismatch)
 *  7. Food pickup regression: "pick up food from McDonald's" → errands, not rides
 *  8. Errand regression: "Can someone grab milk from HEB" → errands, not rides
 *  9. Full ride flow: filling all fields enables confirm button
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'
import { seedTermsAcceptance, seedTourCompleted, getUserId, driverCreds, pax1Creds } from '../helpers/db'
import { goToDashboard } from '../helpers/fixtures'

const WALMART_RIDE_MOCK = {
  category: 'rides' as const,
  title: 'Ride to Walmart on Harvey Mitchell',
  origin_city: 'Campus',
  destination_city: 'Walmart',
  is_driver: false as const,
  available_seats: null,
  scheduled_time: null,
  location: null,
  is_round_trip: false,
  return_date: null,
  flexible_time: false,
  price_type: null,
  is_airport_ride: false,
  budget: null,
  urgency: 'medium' as const,
  helper_requirements: null,
  missing_fields: ['origin_city', 'destination_city', 'scheduled_time'],
  is_offer: false,
  ambiguous: false,
  clarification_question: null,
  clarification_options: null,
  summary: 'Need a ride to Walmart on Harvey Mitchell along with a friend.',
  payment_mode_unclear: false,
  structured_data: { has_luggage: null, passengers_count: 2 },
}

const WALMART_LOCATIONS = [
  {
    place_name: 'Hullabaloo Hall',
    formatted_address: '255 Houston St, College Station, TX 77840',
    source: 'campus_place' as const,
    needs_details: false,
  },
  {
    place_name: 'Walmart Supercenter Harvey Mitchell',
    formatted_address: '2400 Harvey Mitchell Pkwy S, College Station, TX 77840',
    source: 'campus_place' as const,
    needs_details: false,
  },
]

const ERRAND_FOOD_MOCK = {
  category: 'errands' as const,
  title: "Pick up McDonald's order",
  origin_city: null,
  destination_city: null,
  is_driver: null,
  available_seats: null,
  scheduled_time: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  location: null,
  is_round_trip: false,
  return_date: null,
  flexible_time: false,
  price_type: null,
  is_airport_ride: false,
  budget: null,
  urgency: 'medium' as const,
  helper_requirements: null,
  missing_fields: [],
  is_offer: false,
  ambiguous: false,
  clarification_question: null,
  clarification_options: null,
  summary: "Need someone to pick up food from McDonald's.",
  payment_mode_unclear: false,
  structured_data: { errand_type: 'food_pickup', store_or_place: "McDonald's", task_details: null, reimbursement_type: 'paid' },
}

const ERRAND_GROCERY_MOCK = {
  category: 'errands' as const,
  title: 'Grab milk from HEB',
  origin_city: null,
  destination_city: null,
  is_driver: null,
  available_seats: null,
  scheduled_time: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  location: null,
  is_round_trip: false,
  return_date: null,
  flexible_time: false,
  price_type: null,
  is_airport_ride: false,
  budget: null,
  urgency: 'medium' as const,
  helper_requirements: null,
  missing_fields: [],
  is_offer: false,
  ambiguous: false,
  clarification_question: null,
  clarification_options: null,
  summary: 'Need someone to grab milk from HEB.',
  payment_mode_unclear: false,
  structured_data: { errand_type: 'grocery', store_or_place: 'HEB', task_details: 'milk', reimbursement_type: 'reimburse' },
}

test.describe('Ride intent routing, seats, location gating, and confirm-gate messaging', () => {
  let driverUserId: string
  let pax1UserId: string

  test.beforeAll(async () => {
    driverUserId = await getUserId(driverCreds().email)
    pax1UserId   = await getUserId(pax1Creds().email)
  })

  test.beforeEach(async () => {
    await Promise.all([
      seedTermsAcceptance(driverUserId),
      seedTermsAcceptance(pax1UserId),
      seedTourCompleted(driverUserId),
      seedTourCompleted(pax1UserId),
    ])
  })

  // ── 1: "I need a ride to Walmart" → Rides ────────────────────────────────────
  test('"I need a ride to Walmart" shows category Rides in confirm card', async ({ driverPage: page }) => {
    await mockParseRequest(page, WALMART_RIDE_MOCK)
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Walmart along with my friend')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Category row must say "Rides" — target the specific row to avoid strict mode
    const categoryRow = page.locator('[data-testid="category-row"]')
    await expect(categoryRow).toContainText('Rides')
    await expect(categoryRow).not.toContainText('Errands')
  })

  // ── 2: "along with my friend" → passengers_count=2 → "Seats needed: 2" ───────
  test('"along with my friend" shows Seats needed: 2 in confirm card', async ({ driverPage: page }) => {
    await mockParseRequest(page, WALMART_RIDE_MOCK)
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Walmart along with my friend')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // "Seats needed" row should appear with value "2"
    await expect(page.getByText('Seats needed')).toBeVisible()
    await expect(page.getByText(/^2$/).first()).toBeVisible()
  })

  // ── 3: Confirm disabled when locations missing ────────────────────────────────
  test('confirm button is disabled until both pickup and dropoff are selected', async ({ driverPage: page }) => {
    await mockParseRequest(page, WALMART_RIDE_MOCK)
    await mockLocationSearch(page, WALMART_LOCATIONS)

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Walmart along with my friend')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Disabled before any location selected
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select pickup — still disabled (dropoff missing)
    const pickupPicker = page.locator('[data-testid="location-picker-pickup"]')
    await pickupPicker.locator('input').clear()
    await pickupPicker.locator('input').fill('Hulla')
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(pickupPicker.locator('[data-testid="location-chip"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()
  })

  // ── 4: Confirm-gate message lists specific missing fields ─────────────────────
  test('confirm-gate message shows specific missing fields, not generic text', async ({ driverPage: page }) => {
    await mockParseRequest(page, WALMART_RIDE_MOCK)
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Walmart along with my friend')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const gateMsg = page.locator('[data-testid="confirm-gate-message"]')
    await expect(gateMsg).toBeVisible()

    const text = await gateMsg.textContent()
    // Must include specific fields — not just the generic fallback
    expect(text).not.toBe('Add the missing details above to post')
    expect(text).toMatch(/time/i)
    expect(text).toMatch(/pickup|dropoff/i)
    expect(text).toMatch(/payment/i)
  })

  // ── 5: Ride does NOT require errand_type or task_details ──────────────────────
  test('ride request confirm card does not show errand_type or task_details questions', async ({ driverPage: page }) => {
    await mockParseRequest(page, WALMART_RIDE_MOCK)
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Walmart along with my friend')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Errand followup questions must NOT appear for a ride request
    await expect(page.getByText('What type of errand?')).not.toBeVisible()
    await expect(page.getByText('What should they pick up or do?')).not.toBeVisible()
  })

  // ── 6: Category and title are both ride-consistent ───────────────────────────
  test('category and title are both rides-related (no Errands+Ride mismatch)', async ({ driverPage: page }) => {
    await mockParseRequest(page, WALMART_RIDE_MOCK)
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Walmart along with my friend')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Category row must say Rides — use specific testid to avoid strict-mode violations
    const categoryRow = page.locator('[data-testid="category-row"]')
    await expect(categoryRow).toContainText('Rides')
    await expect(categoryRow).not.toContainText('Errands')

    // Title must contain "Walmart" or "Ride"
    await expect(page.getByText(/Ride to Walmart|Walmart.*[Rr]ide/)).toBeVisible()
  })

  // ── 7: Food pickup regression ─────────────────────────────────────────────────
  test('food pickup request routes to errands and shows errand confirm card', async ({ pax1Page: page }) => {
    await mockParseRequest(page, ERRAND_FOOD_MOCK)
    await mockLocationSearch(page, [
      {
        place_name: "McDonald's Harvey Mitchell",
        formatted_address: '1600 Harvey Mitchell Pkwy S, College Station, TX 77840',
        source: 'campus_place' as const,
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill("Can someone pick up food from McDonald's?")
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Category row must say Errands
    const categoryRow = page.locator('[data-testid="category-row"]')
    await expect(categoryRow).toContainText('Errands')
    await expect(categoryRow).not.toContainText('Rides')

    // Location picker for pickup appears
    await expect(page.locator('[data-testid="location-picker-pickup"]')).toBeVisible()
  })

  // ── 8: Grocery errand regression ─────────────────────────────────────────────
  test('grocery errand routes to errands and shows errand confirm card', async ({ pax1Page: page }) => {
    await mockParseRequest(page, ERRAND_GROCERY_MOCK)
    await mockLocationSearch(page, [
      {
        place_name: 'HEB College Station',
        formatted_address: '1900 Texas Ave S, College Station, TX 77840',
        source: 'campus_place' as const,
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Can someone grab milk from HEB?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Category row must say Errands
    const categoryRow = page.locator('[data-testid="category-row"]')
    await expect(categoryRow).toContainText('Errands')
    await expect(categoryRow).not.toContainText('Rides')
  })

  // ── 9: Full ride flow — confirm enables after all fields ─────────────────────
  test('confirm enables after picking both locations, time, and payment for a ride', async ({ driverPage: page }) => {
    await mockParseRequest(page, WALMART_RIDE_MOCK)
    await mockLocationSearch(page, WALMART_LOCATIONS)

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Walmart along with my friend')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Start: confirm disabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Pick time: Today, Flexible
    await page.locator('[data-testid="time-option"]').filter({ hasText: 'Today' }).click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: 'Flexible' }).waitFor({ timeout: 5_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: 'Flexible' }).click()

    // Select pickup location
    const pickupPicker = page.locator('[data-testid="location-picker-pickup"]')
    await pickupPicker.locator('input').clear()
    await pickupPicker.locator('input').fill('Hulla')
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(pickupPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Select dropoff location
    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').clear()
    await dropoffPicker.locator('input').fill('Walmart')
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(dropoffPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Select payment
    await page.locator('[data-testid="payment-option"]').filter({ hasText: /Split gas/ }).click()

    // Confirm should now be enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled({ timeout: 10_000 })
  })
})
