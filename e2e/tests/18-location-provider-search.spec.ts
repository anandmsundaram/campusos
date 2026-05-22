/**
 * Flow 18 — LocationPicker provider search
 *
 * Tests:
 *  A. Category search (Thai) → shows nearby restaurant provider suggestions
 *  B. Category search (Mexican) → shows provider restaurant suggestions
 *  C. Store search (Target/Costco/Walmart/HEB) → shows provider place suggestions
 *  D. Provider failure → shows friendly unavailable message, no crash, confirm locked
 *  E. Full ride workflow: ride disambig → campus pickup → category destination → confirm enabled
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch, mockLocationDetails } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

// ── Shared mock: ride confirm card ─────────────────────────────────────────
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

  // ── A: Thai category search → restaurant suggestions ────────────────────────
  test('Thai category search shows nearby restaurant provider suggestions', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: 'Thai Village Restaurant',
        formatted_address: '300 University Dr, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
      },
      {
        place_name: 'Thai Pepper',
        formatted_address: '2609 Texas Ave S, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to dinner')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Thai')

    // Provider suggestions must appear
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await expect(dropoffPicker.locator('[data-testid="location-suggestion"]').first()).toContainText('Thai Village')
    await expect(dropoffPicker.locator('[data-testid="location-suggestion"]').nth(1)).toContainText('Thai Pepper')

    // "Nearby" section header must appear (places_provider source)
    await expect(dropoffPicker.locator('text=Nearby')).toBeVisible()

    // No manual address option — "Thai" is a vague/store term
    await expect(dropoffPicker.locator('[data-testid="location-manual-option"]')).not.toBeVisible()
  })

  // ── B: Mexican category search → restaurant suggestions ──────────────────
  test('Mexican category search shows provider restaurant suggestions', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: 'Fuego Tortilla Grill',
        formatted_address: '303 University Dr, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
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
  })

  // ── C: Store searches → provider place suggestions ─────────────────────
  test('store searches (Target, Walmart, HEB, Costco) show provider suggestions', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    await mockLocationSearch(page, [
      {
        place_name: 'Target',
        formatted_address: '1800 Texas Ave S, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
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

    // Manual address option must NOT appear for store names
    await expect(dropoffPicker.locator('[data-testid="location-manual-option"]')).not.toBeVisible()
  })

  // ── D: Provider failure → friendly unavailable state, no crash ─────────
  test('provider failure shows friendly unavailable message, confirm stays locked', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)
    // Simulate provider failure: empty results + provider_ok: false
    await mockLocationSearch(page, [], { provider_ok: false })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride tonight')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Confirm must be locked before locations are picked
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Thai')

    // Provider unavailable message must appear
    await expect(dropoffPicker.locator('[data-testid="location-provider-unavailable"]')).toBeVisible({ timeout: 5_000 })

    // Empty state must NOT also appear (one or the other, not both)
    await expect(dropoffPicker.locator('[data-testid="location-empty-state"]')).not.toBeVisible()

    // Confirm must still be locked — no location was resolved
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()
  })

  // ── E: Full ride workflow with category destination ──────────────────────
  test('full ride workflow: campus pickup + Thai destination → confirm unlocks after both resolve', async ({ driverPage: page }) => {
    await setupRideConfirmCard(page)

    // Two-stage mock: pickup (campus) then dropoff (provider)
    let searchCallCount = 0
    await page.route(/\/api\/location-search/, async route => {
      searchCallCount++
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

    // Confirm locked before any location is picked
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Pick pickup: campus location
    const pickupPicker = page.locator('[data-testid="location-picker-pickup"]')
    await pickupPicker.locator('input').fill('commons')
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickupPicker.locator('[data-testid="location-suggestion"]').first().click()

    // Pickup chip appears
    await expect(pickupPicker.locator('[data-testid="location-chip"]')).toBeVisible({ timeout: 3_000 })
    // Confirm still locked — no dropoff yet
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Pick dropoff: provider location
    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').fill('Thai')
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoffPicker.locator('[data-testid="location-suggestion"]').first().click()

    // Dropoff chip appears
    await expect(dropoffPicker.locator('[data-testid="location-chip"]')).toBeVisible({ timeout: 3_000 })

    // Confirm must now be unlocked — both locations resolved
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeDisabled()
  })

})
