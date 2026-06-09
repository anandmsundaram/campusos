/**
 * Spec 37 — Landing page
 *
 * Tests:
 *  1.  Landing page loads and shows hero heading
 *  2.  Navbar login link points to /login
 *  3.  Navbar signup link points to /signup
 *  4.  Hero signup CTA points to /signup
 *  5.  Hero login CTA points to /login
 *  6.  "How it works" section is present
 *  7.  "For helpers" section is present
 *  8.  "Safety" section is present
 *  9.  Final CTA signup button present
 * 10.  Final CTA login button present
 * 11.  Authenticated user visiting / is redirected to /dashboard
 * 12.  PWA manifest is reachable at /manifest.webmanifest
 * 13.  PWA manifest has required fields (name, start_url, display)
 */

import { test, expect } from '../helpers/fixtures'

test.describe('Landing page', () => {
  test('landing page loads and shows hero heading', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      await expect(page.locator('h1')).toContainText('Campus help in 30 seconds', { timeout: 10_000 })
      await expect(page.locator('[data-testid="landing-hero"]')).toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('navbar login link points to /login', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      const link = page.locator('[data-testid="nav-login-link"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
      await expect(link).toHaveAttribute('href', '/login')
    } finally {
      await ctx.close()
    }
  })

  test('navbar signup link points to /signup', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      const link = page.locator('[data-testid="nav-signup-link"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
      await expect(link).toHaveAttribute('href', '/signup')
    } finally {
      await ctx.close()
    }
  })

  test('hero signup CTA points to /signup', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      const link = page.locator('[data-testid="hero-signup-link"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
      await expect(link).toHaveAttribute('href', '/signup')
    } finally {
      await ctx.close()
    }
  })

  test('hero login CTA points to /login', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      const link = page.locator('[data-testid="hero-login-link"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
      await expect(link).toHaveAttribute('href', '/login')
    } finally {
      await ctx.close()
    }
  })

  test('"How it works" section is present', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      await expect(page.locator('[data-testid="landing-how-it-works"]')).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })

  test('"For helpers" section is present', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      await expect(page.locator('[data-testid="landing-for-helpers"]')).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })

  test('"Safety" section is present', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      await expect(page.locator('[data-testid="landing-safety"]')).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })

  test('final CTA signup button is present', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      const link = page.locator('[data-testid="cta-signup-link"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
      await expect(link).toHaveAttribute('href', '/signup')
    } finally {
      await ctx.close()
    }
  })

  test('final CTA login button is present', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/')
      const link = page.locator('[data-testid="cta-login-link"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
      await expect(link).toHaveAttribute('href', '/login')
    } finally {
      await ctx.close()
    }
  })

  test('authenticated user visiting / is redirected to /dashboard', async ({ driverPage }) => {
    await driverPage.goto('/')
    await expect(driverPage).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('sign out redirects to landing page /', async ({ driverPage }) => {
    await driverPage.goto('/dashboard')
    await expect(driverPage).toHaveURL(/\/dashboard/, { timeout: 10_000 })
    // Click desktop logout button
    await driverPage.locator('[data-testid="logout-btn"]').click()
    await expect(driverPage).toHaveURL(/\/$/, { timeout: 10_000 })
  })

  test('PWA manifest is reachable at /manifest.webmanifest', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      const response = await page.goto('/manifest.webmanifest')
      expect(response?.status()).toBe(200)
      const ct = response?.headers()['content-type'] ?? ''
      expect(ct).toMatch(/json|manifest/)
    } finally {
      await ctx.close()
    }
  })

  test('PWA manifest has required fields', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      const response = await page.goto('/manifest.webmanifest')
      const body = await response?.json()
      expect(body.name).toBe('CampusOS')
      expect(body.start_url).toBe('/')
      expect(body.display).toBe('standalone')
    } finally {
      await ctx.close()
    }
  })

  test('/icon loads as image/png without auth redirect', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      const response = await page.goto('/icon')
      expect(response?.status()).toBe(200)
      const ct = response?.headers()['content-type'] ?? ''
      expect(ct).toMatch(/image\/png/)
    } finally {
      await ctx.close()
    }
  })

  test('/apple-icon loads as image/png without auth redirect', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      const response = await page.goto('/apple-icon')
      expect(response?.status()).toBe(200)
      const ct = response?.headers()['content-type'] ?? ''
      expect(ct).toMatch(/image\/png/)
    } finally {
      await ctx.close()
    }
  })
})
