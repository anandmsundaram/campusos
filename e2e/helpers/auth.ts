/**
 * Authentication helpers for E2E tests.
 *
 * Login state is saved to playwright/.auth/ and reused across tests in the
 * same run, avoiding a login round-trip before each spec.
 */

import { Page, BrowserContext } from '@playwright/test'
import path from 'path'
import type { LocationSuggestion, ResolvedLocation } from '@/lib/location-types'

// ─── Storage-state paths ──────────────────────────────────────────────────────

export const AUTH_DIR = path.resolve(__dirname, '../../playwright/.auth')

export const storageStatePath = {
  driver: path.join(AUTH_DIR, 'driver.json'),
  pax1: path.join(AUTH_DIR, 'pax1.json'),
  pax2: path.join(AUTH_DIR, 'pax2.json'),
}

// ─── Login helper ─────────────────────────────────────────────────────────────

/**
 * Log in via the /login page and wait for the dashboard to load.
 * Does NOT save storage state — use saveSession() after calling this.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  // Wait for feed to load (tab bar is a reliable landmark)
  await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 10_000 })
}

/**
 * Log in and immediately save the browser storage state to disk so other
 * tests can reuse the session without re-authenticating.
 */
export async function loginAndSave(
  context: BrowserContext,
  page: Page,
  email: string,
  password: string,
  savePath: string,
): Promise<void> {
  await loginAs(page, email, password)
  await context.storageState({ path: savePath })
}

// ─── Convenience: get current user id from the page ──────────────────────────

/**
 * Evaluate the Supabase auth session from the browser context and return
 * the current user's UUID. Useful for constructing DB helpers.
 */
export async function getCurrentUserId(page: Page): Promise<string> {
  const id = await page.evaluate(async () => {
    // The browser client writes the session to localStorage
    const keys = Object.keys(localStorage).filter(k => k.includes('supabase'))
    for (const k of keys) {
      try {
        const val = JSON.parse(localStorage.getItem(k) ?? '{}')
        if (val?.user?.id) return val.user.id
        if (val?.session?.user?.id) return val.session.user.id
      } catch { /* skip */ }
    }
    return null
  })
  if (!id) throw new Error('Could not read user id from page localStorage')
  return id
}

// ─── Mock AI parser ───────────────────────────────────────────────────────────

export interface MockParsedRequest {
  category: string
  title: string
  origin_city: string | null
  destination_city: string | null
  is_driver: boolean | null
  available_seats: number | null
  budget: number | null
  urgency: string
  scheduled_time: string | null
  location: string | null
  is_round_trip: boolean
  return_date: string | null
  flexible_time: boolean
  price_type: 'fixed' | 'split' | 'free' | null
  is_airport_ride: boolean | null
  helper_requirements: string | null
  missing_fields: string[]
  is_offer: boolean
  ambiguous: boolean
  clarification_question: string | null
  clarification_options: Array<{ label: string; appended_text: string }> | null
  summary: string
  payment_mode_unclear: boolean
  structured_data: Record<string, unknown> | null
}

/**
 * Intercept /api/parse-request and return a canned response.
 * Must be called before the textarea is submitted.
 */
export async function mockParseRequest(
  page: Page,
  response: Partial<MockParsedRequest>,
): Promise<void> {
  const defaults: MockParsedRequest = {
    category: 'rides',
    title: 'E2E Test Ride',
    origin_city: 'Austin',
    destination_city: 'Dallas',
    is_driver: true,
    available_seats: 3,
    budget: 20,
    urgency: 'medium',
    scheduled_time: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    location: null,
    is_round_trip: false,
    return_date: null,
    flexible_time: false,
    price_type: 'fixed',
    is_airport_ride: false,
    helper_requirements: null,
    missing_fields: [],
    is_offer: false,
    ambiguous: false,
    clarification_question: null,
    clarification_options: null,
    summary: 'E2E test ride from Austin to Dallas.',
    payment_mode_unclear: false,
    structured_data: null,
  }

  await page.route('/api/parse-request', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...defaults, ...response }),
    })
  })
}

// ─── Default stubs for location mocks ────────────────────────────────────────

const DEFAULT_LOCATION_RESULT: LocationSuggestion = {
  place_name: 'Test Location',
  formatted_address: '123 Test St, College Station, TX 77840',
  source: 'campus_place',
  needs_details: false,
}

const DEFAULT_LOCATION_DETAILS: ResolvedLocation = {
  place_name: 'Test Location',
  formatted_address: '123 Test St, College Station, TX 77840',
  source: 'places_provider',
  original_query: 'test',
}

/**
 * Intercept /api/location-search and return canned suggestions.
 * Must be called before the picker input is interacted with.
 * Pass provider_ok: false to simulate a provider failure.
 */
export async function mockLocationSearch(
  page: Page,
  results: Partial<LocationSuggestion>[],
  { provider_ok = true }: { provider_ok?: boolean } = {},
): Promise<void> {
  await page.route(/\/api\/location-search/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: results.map(r => ({ ...DEFAULT_LOCATION_RESULT, ...r })),
        provider_ok,
      }),
    })
  })
}

/**
 * Intercept /api/location-details and return a canned resolved location.
 * Must be called before a `needs_details: true` suggestion is selected.
 */
export async function mockLocationDetails(
  page: Page,
  details: Partial<ResolvedLocation>,
): Promise<void> {
  await page.route(/\/api\/location-details/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DEFAULT_LOCATION_DETAILS, ...details }),
    })
  })
}
