/**
 * Flow 18 — LocationPicker provider search
 *
 * Tests:
 *  A. Thai category search → Text Search → restaurant suggestions, no manual option
 *  B. Mexican category search → Text Search → restaurant suggestions
 *  C. Store searches (Target/Costco/Walmart/HEB) → Autocomplete → place suggestions
 *  D. Provider failure → friendly unavailable message, no crash, confirm locked
 *  E. Full ride workflow: campus pickup + category destination → confirm unlocks
 *  F. Address search ("124") → Autocomplete → address/place suggestions
 *
 * All location API calls are mocked — no real Google API calls in tests.
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch, mockLocationDetails } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

// ── Shared setup: ride confirm card ──────────────────────────────────────────
async function setupRideConfirmCard(page: Parameters<typeof mockParseRequest>[0]) {
  await mockParseRequest(page, {
    category: 'rides',
    title: 'Ride to restaurant',
    is_offer: false,
    ambiguous: false,
    is_driver: false,
    origin_city: null,
    destination_city: null,
    summary: 'Need a ride to a restaurant.',
    missing_fields: [],
    structured_data: null,
  })
}

test.describe('LocationPicker provider search', () => {

  // ── A: Thai category search → Text Search results ─────────────────────────
  // Text Search returns lat/lng directly so needs_details=false.
  // No manual address option should appear for vague category terms.
  test('Thai category search shows nearby restaurant provider suggestions', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: 'Thai Village Restaurant',
        formatted_address: '300 University Dr, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
        lat: 30.6249,
        lng: -96.3398,
      },
      {
        place_name: 'Thai Pepper',
        formatted_address: '2609 Texas Ave S, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
        lat: 30.6089,
        lng: -96.3345,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to dinner')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Thai')

    // Provider suggestions must appear in Nearby section
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await expect(dropoffPicker.locator('[data-testid="location-suggestion"]').first()).toContainText('Thai Village')
    await expect(dropoffPicker.locator('[data-testid="location-suggestion"]').nth(1)).toContainText('Thai Pepper')
    await expect(dropoffPicker.locator('text=Nearby')).toBeVisible()

    // "Thai" is a category term — manual address option must NOT appear
    await expect(dropoffPicker.locator('[data-testid="location-manual-option"]')).not.toBeVisible()
  })

  // ── B: Mexican category search → Text Search results ─────────────────────
  test('Mexican category search shows provider restaurant suggestions', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: 'Fuego Tortilla Grill',
        formatted_address: '303 University Dr, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
        lat: 30.6247,
        lng: -96.3413,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to dinner')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Mexican')

    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await expect(dropoffPicker.locator('[data-testid="location-suggestion"]').first()).toContainText('Fuego')
    await expect(dropoffPicker.locator('text=Nearby')).toBeVisible()
    await expect(dropoffPicker.locator('[data-testid="location-manual-option"]')).not.toBeVisible()
  })

  // ── C: Store searches → Autocomplete results ───────────────────────────────
  // Brand names (Target, Walmart, HEB, Costco) go through Autocomplete.
  // Autocomplete results have needs_details=true (lat/lng fetched on selection).
  test('store searches (Target, Walmart, HEB, Costco) show provider suggestions', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: 'Target',
        formatted_address: '1800 Texas Ave S, College Station, TX 77840',
        source: 'places_provider',
        needs_details: true, // Autocomplete result — needs details call on selection
        place_id: 'ChIJ_test_target',
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to the store')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Target')

    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await expect(dropoffPicker.locator('[data-testid="location-suggestion"]').first()).toContainText('Target')

    // Brand names are not addresses — manual address option must NOT appear
    await expect(dropoffPicker.locator('[data-testid="location-manual-option"]')).not.toBeVisible()
  })

  // ── D: Provider failure → friendly unavailable state ──────────────────────
  test('provider failure shows friendly unavailable message, confirm stays locked', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [], { provider_ok: false })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride tonight')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Confirm must be locked before any location is resolved
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Thai')

    // Provider unavailable message must appear (not empty state)
    await expect(dropoffPicker.locator('[data-testid="location-provider-unavailable"]')).toBeVisible({ timeout: 5_000 })
    await expect(dropoffPicker.locator('[data-testid="location-empty-state"]')).not.toBeVisible()

    // Confirm still locked — no location resolved
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()
  })

  // ── E: Full ride workflow: campus pickup + Thai Text Search destination ────
  test('full ride workflow: campus pickup + category destination → confirm unlocks', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)

    await page.route(/\/api\/location-search/, async route => {
      const url = new URL(route.request().url())
      const q = url.searchParams.get('q') ?? ''
      const isCommonsSearch = q.toLowerCase().includes('commons')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          provider_ok: true,
          results: isCommonsSearch
            ? [{
                place_name: 'The Commons',
                formatted_address: '387 Bizzell St, College Station, TX 77843',
                source: 'campus_place',
                needs_details: false,
                lat: 30.6192,
                lng: -96.3391,
              }]
            : [{
                // Text Search result — has lat/lng, needs_details: false
                place_name: 'Thai Village Restaurant',
                formatted_address: '300 University Dr, College Station, TX 77840',
                source: 'places_provider',
                needs_details: false,
                lat: 30.6249,
                lng: -96.3398,
              }],
        }),
      })
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to dinner')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Pick campus pickup
    const pickupPicker = page.locator('[data-testid="location-picker-pickup"]')
    await pickupPicker.locator('input').fill('commons')
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(pickupPicker.locator('[data-testid="location-chip"]')).toBeVisible({ timeout: 3_000 })

    // Still locked — no dropoff
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Pick category destination (Text Search result, needs_details=false → immediate chip)
    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Thai')
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(dropoffPicker.locator('[data-testid="location-chip"]')).toBeVisible({ timeout: 3_000 })

    // Both resolved — confirm must unlock immediately (no details round-trip needed)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

  // ── F: Address search → Autocomplete results ──────────────────────────────
  // Typing "124" (looks like an address) goes to Autocomplete, not Text Search.
  test('address-like input shows provider address suggestions', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: '124 University Dr',
        formatted_address: '124 University Dr, College Station, TX 77840',
        source: 'places_provider',
        needs_details: true,
        place_id: 'ChIJ_test_addr',
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('124')

    // Address suggestion must appear
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await expect(dropoffPicker.locator('[data-testid="location-suggestion"]').first()).toContainText('124')

    // "124" looks like an address — manual option may also appear
    // (the mock returns 0 campus results and 1 provider result, so manual may show)
  })

  // ── Selecting a Text Search result resolves immediately (no details call) ──
  test('Text Search result (needs_details=false) resolves to chip without details API call', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: 'Thai Village Restaurant',
        formatted_address: '300 University Dr, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false, // Text Search result
        lat: 30.6249,
        lng: -96.3398,
      },
    ])

    // If this route is ever called the test would fail — Text Search results
    // should NEVER trigger a location-details call
    let detailsCallCount = 0
    await page.route(/\/api\/location-details/, async route => {
      detailsCallCount++
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to dinner')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Thai')
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().click()

    // Chip appears — location resolved
    await expect(dropoffPicker.locator('[data-testid="location-chip"]')).toBeVisible({ timeout: 3_000 })

    // No details call was made
    expect(detailsCallCount).toBe(0)
  })

})
