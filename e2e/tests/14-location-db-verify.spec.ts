/**
 * Phase A QA — DB verification for location columns
 * Posts a real ride with mocked locations and verifies the DB row.
 * Cleaned up after each run.
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'
import { adminClient } from '../helpers/db'

test.setTimeout(90_000)

test.describe('Phase A QA — DB verification', () => {
  test('ride row has pickup_location + dropoff_location jsonb with correct values', async ({ driverPage: page, runId }) => {
    const title = `[E2E-${runId}] QA location DB verify`

    await mockParseRequest(page, {
      category: 'rides',
      title,
      origin_city: 'College Station',
      destination_city: 'Dallas',
      is_driver: true,
      available_seats: 2,
      price_type: 'split',
      missing_fields: [],
    })

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
        place_name: 'Dallas Love Field',
        formatted_address: 'Dallas Love Field Airport, Dallas, TX 75235',
        source: 'campus_place',
        needs_details: false,
        lat: 32.8471,
        lng: -96.8518,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill(`[${runId}] driving to Dallas`)
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Confirm disabled initially
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select pickup — clear first (hint may be pre-filled from parser)
    const pickup = page.locator('[data-testid="location-picker-pickup"]')
    await pickup.locator('input').clear()
    await pickup.locator('input').fill('Hulla')
    await pickup.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await pickup.locator('[data-testid="location-suggestion"]').filter({ hasText: 'Hullabaloo' }).first().click()
    await expect(pickup.locator('[data-testid="location-chip"]')).toBeVisible()

    // Select dropoff — clear first to avoid hint pre-fill no-op
    const dropoff = page.locator('[data-testid="location-picker-dropoff"]')
    await dropoff.locator('input').clear()
    await dropoff.locator('input').fill('Dallas')
    await dropoff.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await dropoff.locator('[data-testid="location-suggestion"]').filter({ hasText: 'Dallas' }).first().click()
    await expect(dropoff.locator('[data-testid="location-chip"]')).toBeVisible()

    // Both selected — confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()

    // Post
    await page.locator('[data-testid="confirm-post-btn"]').click()
    await expect(page.getByText('Request posted!')).toBeVisible({ timeout: 8_000 })

    // Query DB
    const sb = adminClient()
    const { data, error } = await sb
      .from('requests')
      .select('id, title, origin_city, destination_city, pickup_location, dropoff_location')
      .like('title', `%${runId}%`)
      .limit(1)
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()

    // pickup_location jsonb structure
    const pickupLoc = data!.pickup_location as Record<string, unknown>
    expect(pickupLoc).not.toBeNull()
    expect(pickupLoc.place_name).toBe('Hullabaloo Hall')
    expect(pickupLoc.source).toBe('campus_place')
    expect(typeof pickupLoc.lat).toBe('number')

    // dropoff_location jsonb structure
    const dropoffLoc = data!.dropoff_location as Record<string, unknown>
    expect(dropoffLoc).not.toBeNull()
    expect(dropoffLoc.place_name).toBe('Dallas Love Field')
    expect(dropoffLoc.source).toBe('campus_place')

    // origin_city + destination_city populated from place_name
    expect(data!.origin_city).toBe('Hullabaloo Hall')
    expect(data!.destination_city).toBe('Dallas Love Field')

    // Cleanup — delete using the E2E run ID in the title
    await sb.from('requests').delete().like('title', `%${runId}%`)
  })
})
