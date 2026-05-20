/**
 * Custom Playwright fixtures.
 *
 * Provides per-test:
 *  - driverPage  : authenticated as the driver test user
 *  - pax1Page    : authenticated as passenger-1
 *  - pax2Page    : authenticated as passenger-2
 *  - runId       : unique string prefix for this test's DB rows
 */

import { test as base, expect, Page, BrowserContext } from '@playwright/test'
import path from 'path'
import { storageStatePath } from './auth'
import { cleanupRunData } from './db'

export { expect }

// ─── Types ────────────────────────────────────────────────────────────────────

type Fixtures = {
  runId: string
  driverPage: Page
  pax1Page: Page
  pax2Page: Page
  driverContext: BrowserContext
  pax1Context: BrowserContext
  pax2Context: BrowserContext
}

// ─── Fixture factory ──────────────────────────────────────────────────────────

async function makeAuthPage(
  browser: Parameters<typeof base.extend>[0] extends infer T ? never : never,
  stateFile: string,
  baseURL: string | undefined,
  context: { context: BrowserContext; page: Page }
): Promise<Page> {
  return context.page
}

// ─── Extended test object ─────────────────────────────────────────────────────

export const test = base.extend<Fixtures>({
  // A unique ID per test, used to scope DB rows and avoid cross-test pollution
  runId: async ({}, use, testInfo) => {
    const id = `${Date.now()}-${testInfo.workerIndex}`
    await use(id)
  },

  // Driver browser context + page, pre-authenticated
  driverContext: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: storageStatePath.driver,
    })
    await use(ctx)
    await ctx.close()
  },

  driverPage: async ({ driverContext }, use) => {
    const page = await driverContext.newPage()
    await use(page)
    await page.close()
  },

  // Passenger-1 browser context + page, pre-authenticated
  pax1Context: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: storageStatePath.pax1,
    })
    await use(ctx)
    await ctx.close()
  },

  pax1Page: async ({ pax1Context }, use) => {
    const page = await pax1Context.newPage()
    await use(page)
    await page.close()
  },

  // Passenger-2 browser context + page, pre-authenticated
  pax2Context: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: storageStatePath.pax2,
    })
    await use(ctx)
    await ctx.close()
  },

  pax2Page: async ({ pax2Context }, use) => {
    const page = await pax2Context.newPage()
    await use(page)
    await page.close()
  },
})

// ─── Page helpers ─────────────────────────────────────────────────────────────

/**
 * Navigate to the dashboard and wait for the feed to be visible.
 */
export async function goToDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /All Open/ }).waitFor({ timeout: 15_000 })
}

/**
 * Switch to the "My Requests" tab and wait for it to render.
 */
export async function goToMyRequests(page: Page): Promise<void> {
  await page.getByRole('button', { name: /My Requests/ }).click()
  // Tab content renders synchronously from server-rendered props
  await page.waitForTimeout(300)
}

/**
 * Switch to the "My Offers" tab and wait for cards to render.
 */
export async function goToMyOffers(page: Page): Promise<void> {
  await page.getByRole('button', { name: /My Offers/ }).click()
  await page.waitForTimeout(300)
}

/**
 * Find a request card by its DB id.
 */
export function requestCard(page: Page, requestId: string) {
  return page.locator(`[data-testid="request-card"][data-request-id="${requestId}"]`)
}

/**
 * Find a my-offer card by offer id.
 */
export function myOfferCard(page: Page, offerId: string) {
  return page.locator(`[data-testid="my-offer-card"][data-offer-id="${offerId}"]`)
}

/**
 * Get the text content of a finance strip cell by testid.
 */
export async function getFinanceValue(
  page: Page,
  which: 'in-play' | 'earned' | 'to-pay' | 'active',
): Promise<string> {
  return (await page.locator(`[data-testid="fin-${which}"]`).textContent()) ?? ''
}

/**
 * Parse a finance value like "$20" or "$0" into a number.
 */
export function parseDollar(val: string): number {
  return parseFloat(val.replace(/[$,]/g, '')) || 0
}
