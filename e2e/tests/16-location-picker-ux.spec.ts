/**
 * LocationPicker UX tests
 *
 * Tests:
 *  1. Hint pre-fill → focus triggers search → suggestions appear without typing
 *  2. Empty state appears when search returns no results
 *  3. Provider (Nearby) results appear for business-name searches
 *  4. Manual address option appears for address-like input
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'

test.describe('LocationPicker UX', () => {

  // ── Test 1: Focus with hint pre-filled triggers search ────────────────────
  test('focus with hint pre-filled triggers search without typing', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'HEB run',
      is_offer: false,
      ambiguous: false,
      summary: 'Need a grocery pickup from HEB.',
      missing_fields: [],
      structured_data: {
        errand_type: 'grocery',
        store_or_place: 'HEB',
        task_details: 'milk and eggs',
        reimbursement_type: 'paid',
      },
    })
    await mockLocationSearch(page, [
      {
        place_name: 'H-E-B College Station',
        formatted_address: '1900 Texas Ave S, College Station, TX 77840',
        source: 'campus_place',
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need HEB groceries')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Just click the picker input — do NOT type anything
    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await expect(picker).toBeVisible()
    await picker.locator('input').click()

    // Suggestions should appear from the hint-triggered search (no typing needed)
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await expect(picker.locator('[data-testid="location-suggestion"]').first()).toContainText('H-E-B')
  })

  // ── Test 2: Empty state when search returns no results ────────────────────
  test('empty state appears when search returns no results', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Errand request',
      is_offer: false,
      ambiguous: false,
      summary: 'Need an errand run.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: null,
        task_details: null,
        reimbursement_type: 'paid',
      },
    })
    // Return empty results for every search
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need an errand run somewhere')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Xyzzy nonexistent place')

    // Empty state message should appear
    await expect(picker.locator('[data-testid="location-empty-state"]')).toBeVisible({ timeout: 5_000 })
  })

  // ── Test 3: Provider results appear in Nearby section ────────────────────
  test('provider results appear in Nearby section for business-name search', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Thai food pickup',
      is_offer: false,
      ambiguous: false,
      summary: 'Pick up Thai food.',
      missing_fields: [],
      structured_data: {
        errand_type: 'food_pickup',
        store_or_place: null,
        task_details: null,
        reimbursement_type: 'paid',
      },
    })
    await mockLocationSearch(page, [
      {
        place_name: 'Thai Village Restaurant',
        formatted_address: '300 University Dr, College Station, TX 77840',
        source: 'places_provider',
        needs_details: false,
      },
    ])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need Thai food picked up')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('Thai')

    // Provider suggestion visible
    await picker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await expect(picker.locator('[data-testid="location-suggestion"]').first()).toContainText('Thai Village')

    // "Nearby" section header must be visible (not "On campus")
    await expect(picker.locator('text=Nearby')).toBeVisible()
  })

  // ── Test 4: Manual address option for address-like input ─────────────────
  test('manual address option appears for address-like input', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Address errand',
      is_offer: false,
      ambiguous: false,
      summary: 'Pick something up.',
      missing_fields: [],
      structured_data: {
        errand_type: 'other',
        store_or_place: null,
        task_details: 'package',
        reimbursement_type: 'paid',
      },
    })
    // Return empty so the manual option is the only choice
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Pick up a package')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    const picker = page.locator('[data-testid="location-picker-pickup"]')
    await picker.locator('input').fill('124 Main St College Station')

    // Manual address option should appear
    await expect(picker.locator('[data-testid="location-manual-option"]')).toBeVisible({ timeout: 5_000 })
  })
})
