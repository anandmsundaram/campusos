/**
 * Flow 1 — Driver ride creation
 *
 * Tests:
 *  - Driver creates a ride via the AI input (mocked parser)
 *  - Card appears in the feed after confirmation
 *  - Seat count badge is visible with the correct count
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch, mockLocationDetails } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

const SEATS = 3
const BUDGET = 25
const ORIGIN = 'Austin'
const DEST = 'Dallas'

test.describe('Ride creation', () => {
  test('driver creates a ride and card appears with correct seat count', async ({ driverPage: page, runId }) => {
    const scheduledTime = new Date(Date.now() + 4 * 3600 * 1000).toISOString()

    // Intercept the Claude AI parser — return deterministic data
    await mockParseRequest(page, {
      category: 'rides',
      title: `[E2E-${runId}] ${ORIGIN} → ${DEST}`,
      origin_city: ORIGIN,
      destination_city: DEST,
      is_driver: true,
      available_seats: SEATS,
      budget: BUDGET,
      urgency: 'medium',
      scheduled_time: scheduledTime,
      price_type: 'fixed',
      missing_fields: [],
    })

    // Mock location API — two campus-place results, no details call needed
    await mockLocationSearch(page, [
      {
        place_name: 'Hullabaloo Hall',
        formatted_address: '255 Houston St, College Station, TX 77840',
        source: 'campus_place',
        needs_details: false,
        lat: 30.6223,
        lng: -96.3339,
      },
      {
        place_name: 'Dallas Union Station',
        formatted_address: '400 S Houston St, Dallas, TX 75202',
        source: 'campus_place',
        needs_details: false,
        lat: 32.7792,
        lng: -96.8089,
      },
    ])
    await mockLocationDetails(page, {
      place_name: 'Dallas Union Station',
      formatted_address: '400 S Houston St, Dallas, TX 75202',
      source: 'places_provider',
      lat: 32.7792,
      lng: -96.8089,
    })

    await goToDashboard(page)

    // Type the request
    await page.locator('[data-testid="request-textarea"]').fill('I am driving Austin to Dallas Friday 10am, 3 seats $25 each')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Wait for parse → confirm card
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.getByText(`[E2E-${runId}]`)).toBeVisible()

    // Confirm button is disabled until both locations selected
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select pickup location
    const pickupPicker = page.locator('[data-testid="location-picker-pickup"]')
    await pickupPicker.locator('input').fill('Hulla')
    const firstPickupSuggestion = pickupPicker.locator('[data-testid="location-suggestion"]').first()
    await firstPickupSuggestion.waitFor({ timeout: 5_000 })
    await firstPickupSuggestion.click()
    await expect(pickupPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Still disabled — dropoff missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select dropoff location (clear first to avoid hint pre-fill no-op)
    const dropoffPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoffPicker.locator('input').clear()
    await dropoffPicker.locator('input').type('Union')
    const firstDropoffSuggestion = dropoffPicker.locator('[data-testid="location-suggestion"]').first()
    await firstDropoffSuggestion.waitFor({ timeout: 5_000 })
    await firstDropoffSuggestion.click()
    await expect(dropoffPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Now enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()

    // Confirm and post
    await page.locator('[data-testid="confirm-post-btn"]').click()

    // After posting, the dashboard refreshes and the card should appear
    await expect(page.getByText('Request posted!')).toBeVisible({ timeout: 8_000 })

    // Navigate away and back to force a fresh server render
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /My Requests/ }).click()

    // Find the card
    const card = page.locator('[data-testid="request-card"]').filter({ hasText: `[E2E-${runId}]` })
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Seat badge
    await expect(card.locator('[data-testid="seats-badge"]')).toContainText(`${SEATS}`)
  })
})
