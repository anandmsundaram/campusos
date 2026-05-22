/**
 * Phase B — errand and moving location resolution tests.
 *
 * Tests A-E are pure UI tests (mocked parse + location search, no DB write).
 * Test F is an integration test that posts a real errand and verifies feed display.
 */

import { test, expect, goToDashboard, goToMyRequests } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch, mockLocationDetails } from '../helpers/auth'
import { adminClient } from '../helpers/db'

test.describe('Errand location resolution', () => {
  test('A: errand location picker appears and gates confirm', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Pick up Chick-fil-A order',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      location: null,
      summary: 'Pick up a pre-ordered Chick-fil-A order nearby.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: 'paid',
        summary: 'Pick up a pre-ordered Chick-fil-A order nearby.',
      },
    })
    await mockLocationSearch(page, [
      {
        place_name: 'Chick-fil-A Harvey Mitchell',
        formatted_address: '1715 Harvey Mitchell Pkwy S, College Station, TX 77840',
        source: 'campus_place',
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need someone to pick up my Chick-fil-A order')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Confirm disabled — no location selected yet
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Location picker visible
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await expect(picker).toBeVisible()

    // Select a location (clear hint first to trigger a fresh search)
    await picker.locator('input').clear()
    await picker.locator('input').fill('Chick-fil')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // food_pickup does not require task_details — confirm should enable
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()
  })

  test('B: grocery errand shows scope warning and requires task_details', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Walmart grocery pickup',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      location: null,
      summary: 'Pick up groceries from Walmart.',
      missing_fields: [],
      structured_data: {
        errand_type: 'grocery',
        store_or_place: 'Walmart',
        task_details: null,
        reimbursement_type: null,
        summary: 'Pick up groceries from Walmart.',
      },
    })
    await mockLocationSearch(page, [
      {
        place_name: 'Walmart Supercenter College Station',
        formatted_address: '1815 Brothers Blvd, College Station, TX 77845',
        source: 'campus_place',
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need Walmart groceries picked up')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Grocery scope warning visible
    await expect(page.locator('[data-testid="grocery-scope-warning"]')).toBeVisible()

    // Confirm disabled — no location, no task_details
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select location (use specific term to bypass vague-word block on "walmart")
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').clear()
    await picker.locator('input').fill('Walmart Brothers')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Still disabled — grocery requires task_details
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Fill task_details
    await page.locator('[data-testid="followup-text-task_details"]').fill('Milk, eggs, and bread')

    // Still disabled — payment not yet selected
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select free payment option to satisfy payment gate
    await page.locator('[data-testid="payment-option"]').first().click()

    // Now enabled — all gates satisfied
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()
  })

  test('C: errand with needs_details location — details fetch completes and chip appears', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Pick something up from Costco',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      location: null,
      summary: 'Pick up an item from the nearest Costco.',
      missing_fields: [],
      structured_data: {
        errand_type: 'other',
        store_or_place: 'Costco',
        task_details: 'Pick up membership renewal card',
        reimbursement_type: 'paid',
        summary: 'Pick up an item from the nearest Costco.',
      },
    })
    await mockLocationSearch(page, [
      {
        place_name: 'Costco Wholesale Bryan',
        formatted_address: '4001 Lake Atlas Dr, Bryan, TX 77807',
        source: 'places_provider',
        needs_details: true,
        place_id: 'ChIJ-costco-test-id',
      },
    ])
    await mockLocationDetails(page, {
      place_name: 'Costco Wholesale Bryan',
      formatted_address: '4001 Lake Atlas Dr, Bryan, TX 77807',
      place_id: 'ChIJ-costco-test-id',
      lat: 30.635,
      lng: -96.41,
      source: 'places_provider',
      original_query: 'Costco',
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need something picked up from Costco')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Confirm disabled — no location yet
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Search for Costco using a specific term (not just "Costco" which is vague)
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').clear()
    await picker.locator('input').fill('Costco Business')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })

    // Click suggestion — triggers details fetch
    await picker.locator('[data-testid="location-suggestion"]').click()

    // After details fetch resolves, chip appears
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible({ timeout: 5_000 })

    // errand_type='other' + task_details present → confirm enables
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()
  })
})

test.describe('Moving location resolution', () => {
  test('D: move_out requires from + to pickers and helpers_needed', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'moving',
      title: 'Help moving out Saturday',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      location: null,
      summary: 'Need help moving out of dorm on Saturday.',
      missing_fields: ['helpers_needed', 'location'],
      structured_data: {
        move_type: 'move_out',
        helpers_needed: null,
        access_type: null,
        has_heavy_items: null,
        truck_needed: null,
        estimated_duration: null,
        summary: 'Need help moving out of dorm on Saturday.',
      },
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
        place_name: 'White Creek Apartments',
        formatted_address: '1455 Jones Butler Rd, College Station, TX 77840',
        source: 'campus_place',
        needs_details: false,
        lat: 30.598,
        lng: -96.332,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need help moving out Saturday')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Both from and to pickers visible (move_out requires destination)
    const fromPicker = page.locator('[data-testid="location-picker-pickup"]')
    const toPicker = page.locator('[data-testid="location-picker-dropoff"]')
    await expect(fromPicker).toBeVisible()
    await expect(toPicker).toBeVisible()

    // Confirm disabled — no from, no to, no helpers
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select helpers_needed chip
    await page.locator('button[type="button"]').filter({ hasText: /^2$/ }).first().click()

    // Still disabled — locations missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select from location
    await fromPicker.locator('input').fill('Hulla')
    await fromPicker.locator('[data-testid="location-suggestion"]').filter({ hasText: 'Hullabaloo' }).first().waitFor({ timeout: 5_000 })
    await fromPicker.locator('[data-testid="location-suggestion"]').filter({ hasText: 'Hullabaloo' }).first().click()
    await expect(fromPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Still disabled — to location missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select to location
    await toPicker.locator('input').fill('White')
    await toPicker.locator('[data-testid="location-suggestion"]').filter({ hasText: 'White Creek' }).first().waitFor({ timeout: 5_000 })
    await toPicker.locator('[data-testid="location-suggestion"]').filter({ hasText: 'White Creek' }).first().click()
    await expect(toPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Still disabled — payment not yet selected
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select free payment option to satisfy payment gate
    await page.locator('[data-testid="payment-option"]').first().click()

    // Now all gates satisfied — confirm enabled
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()
  })

  test('E: furniture move shows only from picker (no to required)', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'moving',
      title: 'Help moving a couch in my apartment',
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      location: null,
      summary: 'Need help moving a couch within my apartment.',
      missing_fields: ['helpers_needed'],
      structured_data: {
        move_type: 'furniture',
        helpers_needed: null,
        access_type: null,
        has_heavy_items: true,
        truck_needed: null,
        estimated_duration: null,
        summary: 'Need help moving a couch within my apartment.',
      },
    })
    await mockLocationSearch(page, [
      {
        place_name: 'Northgate District',
        formatted_address: 'Northgate, College Station, TX 77840',
        source: 'campus_place',
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need help moving a couch in my apartment')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // From picker visible
    const fromPicker = page.locator('[data-testid="location-picker-pickup"]')
    await expect(fromPicker).toBeVisible()

    // To picker NOT rendered for furniture moves
    await expect(page.locator('[data-testid="location-picker-dropoff"]')).not.toBeVisible()

    // Confirm disabled — no location, no helpers
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select helpers_needed
    await page.locator('button[type="button"]').filter({ hasText: /^2$/ }).first().click()

    // Still disabled — location missing
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select from location
    await fromPicker.locator('input').fill('Northgate')
    await fromPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await fromPicker.locator('[data-testid="location-suggestion"]').click()
    await expect(fromPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Still disabled — payment not yet selected
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Select free payment option to satisfy payment gate
    await page.locator('[data-testid="payment-option"]').first().click()

    // Enabled — furniture needs from + helpers_needed + payment
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeEnabled()
  })
})

test.describe('Feed display after posting', () => {
  test('F: errand card shows resolved pickup_location.place_name in meta row', async ({ driverPage: page, runId }) => {
    const title = `[E2E-${runId}] Chick-fil-A pickup`

    await mockParseRequest(page, {
      category: 'errands',
      title,
      origin_city: null,
      destination_city: null,
      is_driver: null,
      available_seats: null,
      location: null,
      summary: 'Pick up a Chick-fil-A order.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: 'Chick-fil-A',
        task_details: null,
        reimbursement_type: 'paid',
        summary: 'Pick up a Chick-fil-A order.',
      },
    })
    await mockLocationSearch(page, [
      {
        place_name: 'Chick-fil-A Harvey Mitchell',
        formatted_address: '1715 Harvey Mitchell Pkwy S, College Station, TX 77840',
        source: 'campus_place',
        needs_details: false,
        lat: 30.601,
        lng: -96.326,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill(`[${runId}] pick up Chick-fil-A`)
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Select pickup location
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').clear()
    await picker.locator('input').fill('Chick-fil')
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await picker.locator('[data-testid="location-suggestion"]').click()
    await expect(picker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Post
    await page.locator('[data-testid="confirm-post-btn"]').click()
    await expect(page.getByText('Request posted!')).toBeVisible({ timeout: 10_000 })

    // Switch to My Requests tab after page refresh
    await goToMyRequests(page)

    // Find the card for our errand
    const card = page.locator('[data-testid="request-card"]').filter({ hasText: runId })
    await card.waitFor({ timeout: 15_000 })

    // Feed card meta row shows the resolved place name
    await expect(card.locator('[data-testid="card-location-meta"]')).toContainText('Chick-fil-A Harvey Mitchell')

    // Cleanup
    const sb = adminClient()
    await sb.from('requests').delete().like('title', `%${runId}%`)
  })
})
