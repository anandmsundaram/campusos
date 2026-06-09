/**
 * Spec 38 — Account lifecycle and support pages
 *
 * Tests:
 *  1.  Profile page shows the Danger Zone / Delete Account section
 *  2.  Delete Account button shows confirmation step (does not delete immediately)
 *  3.  Confirmation step shows confirm and cancel buttons
 *  4.  Cancel returns to idle state
 *  5.  /support page is publicly reachable (no auth required)
 *  6.  /support page shows contact email
 *  7.  Terms page no longer contains the "private beta" disclaimer
 *  8.  /api/account/delete requires authentication (returns 401 without session)
 */

import { test, expect } from '../helpers/fixtures'

test.describe('Account lifecycle', () => {
  // pax1Page is used (not driverPage) because spec 37's sign-out test revokes
  // the driver session, making driverPage unusable in specs that run after it.
  test('profile page shows Danger Zone section', async ({ pax1Page }) => {
    await pax1Page.goto('/dashboard/profile')
    await expect(pax1Page.locator('[data-testid="danger-zone"]')).toBeVisible({ timeout: 15_000 })
  })

  test('Delete Account button shows confirmation — does not delete immediately', async ({ pax1Page }) => {
    await pax1Page.goto('/dashboard/profile')
    await expect(pax1Page.locator('[data-testid="danger-zone"]')).toBeVisible({ timeout: 15_000 })
    await pax1Page.locator('[data-testid="delete-account-btn"]').click()
    // Confirm and cancel buttons must appear
    await expect(pax1Page.locator('[data-testid="delete-account-confirm-btn"]')).toBeVisible({ timeout: 5_000 })
    await expect(pax1Page.locator('[data-testid="delete-account-cancel-btn"]')).toBeVisible()
    // The initial "Delete my account" button is gone once confirm step is shown
    await expect(pax1Page.locator('[data-testid="delete-account-btn"]')).not.toBeVisible()
  })

  test('Cancel returns to idle state', async ({ pax1Page }) => {
    await pax1Page.goto('/dashboard/profile')
    await expect(pax1Page.locator('[data-testid="danger-zone"]')).toBeVisible({ timeout: 15_000 })
    await pax1Page.locator('[data-testid="delete-account-btn"]').click()
    await expect(pax1Page.locator('[data-testid="delete-account-cancel-btn"]')).toBeVisible({ timeout: 5_000 })
    await pax1Page.locator('[data-testid="delete-account-cancel-btn"]').click()
    // Back to idle: initial button is visible again, confirm step is gone
    await expect(pax1Page.locator('[data-testid="delete-account-btn"]')).toBeVisible({ timeout: 5_000 })
    await expect(pax1Page.locator('[data-testid="delete-account-confirm-btn"]')).not.toBeVisible()
  })

  test('/api/account/delete is protected — unauthenticated request is redirected away', async ({ browser }) => {
    const ctx = await browser.newContext() // no stored auth
    const page = await ctx.newPage()
    try {
      const response = await page.request.post('/api/account/delete')
      // Middleware redirects unauthenticated requests to /login (307 → 200 HTML).
      // The final URL must be /login, confirming the endpoint is protected.
      expect(response.url()).toMatch(/\/login/)
    } finally {
      await ctx.close()
    }
  })
})

test.describe('Support page', () => {
  test('/support is publicly reachable without auth', async ({ browser }) => {
    const ctx = await browser.newContext() // no stored auth
    const page = await ctx.newPage()
    try {
      await page.goto('/support')
      await expect(page.locator('h1')).toContainText('Support', { timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })

  test('/support shows contact email', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/support')
      await expect(page.locator('a[href="mailto:campusosapp@gmail.com"]').first()).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })
})

test.describe('Terms page', () => {
  test('Terms page does not contain the private-beta disclaimer', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/terms')
      await expect(page.locator('body')).not.toContainText('private beta', { timeout: 10_000 })
      await expect(page.locator('body')).not.toContainText('not been reviewed by a lawyer')
    } finally {
      await ctx.close()
    }
  })
})
