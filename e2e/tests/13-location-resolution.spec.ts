/**
 * Flow 13 — Location resolution (Phase A: rides)
 *
 * Tests:
 *  A. Ride confirm requires both pickup + dropoff to enable Confirm
 *  B. Hint text pre-fills input but does NOT enable Confirm by itself
 *  C. Google provider suggestion (needs_details=true) triggers details fetch and shows chip
 *  D. Numeric query (looks like address number) shows provider suggestions
 *  E. Full address entry shows manual option with unverified label
 *  F. Vague words are blocked — manual option never shown
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch, mockLocationDetails } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

const CAMPUS_PICKUP: Parameters<typeof mockLocationSearch>[1][number] = {
  place_name: 'Hullabaloo Hall',
  formatted_address: '255 Houston St, College Station, TX 77840',
  source: 'campus_place',
  needs_details: false,
  lat: 30.6223,
  lng: -96.3339,
}

const CAMPUS_DROPOFF: Parameters<typeof mockLocationSearch>[1][number] = {
  place_name: 'Easterwood Airport',
  formatted_address: '1620 Easterwood Dr, College Station, TX 77840',
  source: 'campus_place',
  needs_details: false,
  lat: 30.5958,
  lng: -96.3606,
}

test.describe('Location resolution — Phase A', () => {

  // ── A: Both pickers required before Confirm enables ──────────────────────────
  test('A: confirm only enables after both pickup and dropoff resolved', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Test ride',
      origin_city: null,
      destination_city: null,
      is_driver: false,
      missing_fields: ['origin_city', 'destination_city'],
    })
    await mockLocationSearch(page, [CAMPUS_PICKUP, CAMPUS_DROPOFF])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to the airport')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select pickup
    const pickup = page.locator('[data-testid="location-picker-pickup"]')
    await pickup.locator('input').fill('Hull')
    await pickup.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickup.locator('[data-testid="location-suggestion"]').first().click()
    await expect(pickup.locator('[data-testid="location-chip"]')).toBeVisible()

    // Still disabled — dropoff not set
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select dropoff
    const dropoff = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoff.locator('input').fill('Easter')
    await dropoff.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoff.locator('[data-testid="location-suggestion"]').first().click()
    await expect(dropoff.locator('[data-testid="location-chip"]')).toBeVisible()

    // Now enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()
  })

  // ── B: Hint text alone does not enable Confirm ────────────────────────────────
  test('B: parser hint in input does not satisfy location requirement', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Test ride with hints',
      // Parser extracted cities but pickers still need explicit selection
      origin_city: 'my dorm',
      destination_city: 'Target',
      is_driver: false,
      missing_fields: [],
    })
    await mockLocationSearch(page, [CAMPUS_PICKUP])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride from my dorm to Target')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Hints pre-fill the inputs but confirm is still disabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()
    // No chips visible yet — just pre-filled text
    await expect(page.locator('[data-testid="location-picker-pickup"] [data-testid="location-chip"]')).not.toBeVisible()
  })

  // ── C: Google provider suggestion triggers details fetch ─────────────────────
  test('C: selecting a places_provider suggestion fetches details and shows chip', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Costco run',
      origin_city: null,
      destination_city: null,
      is_driver: false,
      missing_fields: [],
    })
    await mockLocationSearch(page, [
      {
        place_name: 'Costco Wholesale',
        formatted_address: 'Costco Wholesale, Bryan, TX 77802',
        source: 'places_provider',
        needs_details: true,
        place_id: 'fake-place-id-costco',
      },
      {
        place_name: 'Costco Business Center',
        formatted_address: 'Costco Business Center, College Station, TX 77840',
        source: 'places_provider',
        needs_details: true,
        place_id: 'fake-place-id-costco-biz',
      },
    ])
    await mockLocationDetails(page, {
      place_name: 'Costco Wholesale',
      formatted_address: '2800 Earl Rudder Fwy S, Bryan, TX 77802',
      place_id: 'fake-place-id-costco',
      source: 'places_provider',
      lat: 30.6321,
      lng: -96.3102,
      original_query: 'Costco',
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride to Costco')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const pickup = page.locator('[data-testid="location-picker-pickup"]')
    await pickup.locator('input').fill('Costco')
    const suggestions = pickup.locator('[data-testid="location-suggestion"]')
    await suggestions.first().waitFor({ timeout: 5_000 })
    await expect(suggestions).toHaveCount(2)

    // Click first suggestion — triggers details fetch
    await suggestions.first().click()

    // Chip should appear (may take a moment for details call to complete)
    await expect(pickup.locator('[data-testid="location-chip"]')).toBeVisible({ timeout: 5_000 })
    await expect(pickup.locator('[data-testid="location-chip"]')).toContainText('Costco Wholesale')
  })

  // ── D: Numeric query shows provider suggestions ───────────────────────────────
  test('D: numeric-prefix address query returns provider suggestions', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Address pickup',
      origin_city: null,
      destination_city: null,
      is_driver: false,
      missing_fields: [],
    })
    await mockLocationSearch(page, [
      {
        place_name: '1246 Harvey Mitchell Pkwy',
        formatted_address: '1246 Harvey Mitchell Pkwy, College Station, TX 77840',
        source: 'places_provider',
        needs_details: true,
        place_id: 'fake-addr-1',
      },
      {
        place_name: '124 Jersey St',
        formatted_address: '124 Jersey St, College Station, TX 77840',
        source: 'places_provider',
        needs_details: true,
        place_id: 'fake-addr-2',
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride from 124')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const pickup = page.locator('[data-testid="location-picker-pickup"]')
    await pickup.locator('input').fill('124')
    const suggestions = pickup.locator('[data-testid="location-suggestion"]')
    await suggestions.first().waitFor({ timeout: 5_000 })
    await expect(suggestions).toHaveCount(2)
  })

  // ── E: Full address shows manual option with unverified chip ─────────────────
  test('E: full address entry shows manual option and produces unverified chip', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Wellborn pickup',
      origin_city: null,
      destination_city: null,
      is_driver: false,
      missing_fields: [],
    })
    // No campus results, no Google results — only manual option shows
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride from 2100 Wellborn Rd')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const pickup = page.locator('[data-testid="location-picker-pickup"]')
    await pickup.locator('input').fill('2100 Wellborn Rd College Station TX')

    // Manual option should appear
    await expect(pickup.locator('[data-testid="location-manual-option"]')).toBeVisible({ timeout: 5_000 })

    // Click manual option
    await pickup.locator('[data-testid="location-manual-option"]').click()

    // Unverified chip should appear
    await expect(pickup.locator('[data-testid="location-chip-unverified"]')).toBeVisible()
    await expect(pickup.locator('[data-testid="location-chip-unverified"]')).toContainText('not verified')
  })

  // ── F: Vague words blocked — manual option never shown ───────────────────────
  test('F: vague words are blocked and never show the manual address option', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'rides',
      title: 'Vague pickup',
      origin_city: null,
      destination_city: null,
      is_driver: false,
      missing_fields: [],
    })
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I need a ride')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const pickup = page.locator('[data-testid="location-picker-pickup"]')

    for (const vague of ['Target', 'Walmart', 'my dorm', 'campus', 'home']) {
      await pickup.locator('input').fill(vague)
      // Wait a moment for any debounced search to settle
      await page.waitForTimeout(400)
      await expect(pickup.locator('[data-testid="location-manual-option"]')).not.toBeVisible()
    }
  })
})
