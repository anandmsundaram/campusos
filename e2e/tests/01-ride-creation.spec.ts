/**
 * Flow 1 — Driver ride creation
 *
 * Tests:
 *  - Driver creates a ride via the AI input (mocked parser)
 *  - Card appears in the feed after confirmation
 *  - Seat count badge is visible with the correct count
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest } from '../helpers/auth'
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

    await goToDashboard(page)

    // Type the request
    await page.locator('[data-testid="request-textarea"]').fill('I am driving Austin to Dallas Friday 10am, 3 seats $25 each')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Wait for parse → confirm card
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await expect(page.getByText(`[E2E-${runId}]`)).toBeVisible()
    await expect(page.getByText('3')).toBeVisible() // seats

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
