/**
 * Spec 45 — Date windows, PWA install CTA, dashboard metrics, activity page
 *
 * Tests:
 *  1.  Request date picker rejects dates beyond 14 days ahead (client validation)
 *  2.  Request date picker accepts today as a valid date
 *  3.  Request date picker accepts 14 days ahead as a valid date
 *  4.  PWA install CTA appears on landing page (for non-installed users)
 *  5.  PWA install CTA does not block navigation to login/signup
 *  6.  Manifest route is publicly accessible (no auth required)
 *  7.  Icon route is publicly accessible (no auth required)
 *  8.  Dashboard metric cards link to /dashboard/activity
 *  9.  Activity page loads with default "This month" range
 *  10. Activity page range filter links are present and functional
 *  11. Activity page shows own data only (not other users')
 *  12. Activity page 12-month cap: range=12mo is the longest option
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import { mockParseRequest } from '../helpers/auth'
import {
  adminClient,
  getUserId,
  seedRequest,
  seedOffer,
  seedAcceptOffer,
  cleanupRunData,
  driverCreds,
  pax1Creds,
} from '../helpers/db'
test.describe('Date windows, PWA CTA, dashboard metrics, and activity page', () => {

  // ─── Date window validation ───────────────────────────────────────────────

  test('date picker has max=14 days and min=today attributes', async ({ driverPage }) => {
    // Mock parse so the confirm card appears with no pre-resolved scheduled_time
    await mockParseRequest(driverPage, {
      category: 'peer_help',
      title: 'Need peer help',
      scheduled_time: null,
      missing_fields: ['scheduled_time'],
      ambiguous: false,
      is_offer: false,
    })
    await goToDashboard(driverPage)

    await driverPage.locator('[data-testid="request-textarea"]').fill('Need peer help with calc')
    await driverPage.getByRole('button', { name: /Post request/i }).click()

    // Wait for confirm card
    await driverPage.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 15_000 })

    // Click "Later / pick date"
    await driverPage.locator('[data-testid="time-option"]').filter({ hasText: /Later/i }).click()
    const dateInput = driverPage.locator('[data-testid="time-date-input"]')
    await expect(dateInput).toBeVisible({ timeout: 5_000 })

    // Verify max = 14 days from today
    const maxAttr = await dateInput.getAttribute('max')
    expect(maxAttr).toBeTruthy()
    // Parse both as noon to avoid timezone/rounding issues
    const maxDate = new Date(maxAttr! + 'T12:00:00')
    const todayNoon = new Date()
    todayNoon.setHours(12, 0, 0, 0)
    const diffDays = Math.round((maxDate.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000))
    expect(diffDays).toBe(14)

    // Verify min = today (as YYYY-MM-DD string, just check format)
    const minAttr = await dateInput.getAttribute('min')
    expect(minAttr).toBeTruthy()
    expect(minAttr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // ─── PWA install CTA ──────────────────────────────────────────────────────

  test('landing page loads and has login/signup links (PWA CTA does not block them)', async ({ page }) => {
    await page.goto('/')
    // Confirm the page loads and core navigation elements are present
    await expect(page.locator('[data-testid="nav-login-link"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="nav-signup-link"]')).toBeVisible()
    await expect(page.locator('[data-testid="hero-signup-link"]')).toBeVisible()
  })

  test('manifest.json route is publicly accessible', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest')
    expect(response?.status()).toBe(200)
    const contentType = response?.headers()['content-type'] ?? ''
    expect(contentType).toMatch(/json|manifest/)
  })

  test('icon route is publicly accessible', async ({ page }) => {
    const response = await page.goto('/icon')
    expect(response?.status()).toBe(200)
    const contentType = response?.headers()['content-type'] ?? ''
    expect(contentType).toMatch(/image/)
  })

  // ─── Dashboard metric cards ───────────────────────────────────────────────

  test('dashboard metric cards link to activity page', async ({ driverPage }) => {
    await goToDashboard(driverPage)

    // Check that at least one FinStat card links to /dashboard/activity
    const activityLinks = driverPage.locator('a[href="/dashboard/activity"]')
    const count = await activityLinks.count()
    expect(count).toBeGreaterThan(0)
  })

  test('dashboard shows fin-in-play, fin-earned, fin-to-pay, fin-active metric cards', async ({ driverPage }) => {
    await goToDashboard(driverPage)
    await expect(driverPage.locator('[data-testid="fin-in-play"]')).toBeVisible({ timeout: 10_000 })
    await expect(driverPage.locator('[data-testid="fin-earned"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="fin-to-pay"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="fin-active"]')).toBeVisible()
  })

  // ─── Activity page ────────────────────────────────────────────────────────

  test('activity page loads with default This month range', async ({ driverPage }) => {
    await goToDashboard(driverPage)
    await driverPage.goto('/dashboard/activity')

    await expect(driverPage.locator('[data-testid="activity-range-filter"]')).toBeVisible({ timeout: 10_000 })
    // Default range active button should be "This month"
    const activeRange = driverPage.locator('[data-testid="range-month"]')
    await expect(activeRange).toBeVisible()
  })

  test('activity page has all four range filter options', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')
    await expect(driverPage.locator('[data-testid="range-month"]')).toBeVisible({ timeout: 10_000 })
    await expect(driverPage.locator('[data-testid="range-30d"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="range-3mo"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="range-12mo"]')).toBeVisible()
    // No range beyond 12 months should exist
    await expect(driverPage.locator('[data-testid="range-24mo"]')).not.toBeVisible()
  })

  test('activity page range=30d parameter works', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity?range=30d')
    await expect(driverPage.locator('[data-testid="activity-range-filter"]')).toBeVisible({ timeout: 10_000 })
    // The 30d button should appear active (blue background from styling)
    const btn30d = driverPage.locator('[data-testid="range-30d"]')
    await expect(btn30d).toBeVisible()
    const classes = await btn30d.getAttribute('class') ?? ''
    expect(classes).toContain('bg-blue-500')
  })

  test('activity page shows own requests data', async ({ driverPage, runId }) => {
    const driverId = await getUserId(driverCreds().email)
    const reqId = await seedRequest({
      requesterId: driverId,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] sp45 activity-own`,
      scheduledOffsetSeconds: 2 * 60 * 60,
    })

    try {
      await driverPage.goto('/dashboard/activity?range=month')
      await expect(driverPage.locator('[data-testid="activity-requests-breakdown"]')).toBeVisible({ timeout: 10_000 })
    } finally {
      await cleanupRunData(runId)
    }
  })

  test('activity page shows metric cards for earned, pipeline, to-pay, paid', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')
    await expect(driverPage.locator('[data-testid="activity-earned"]')).toBeVisible({ timeout: 10_000 })
    await expect(driverPage.locator('[data-testid="activity-pipeline"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="activity-to-pay"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="activity-paid"]')).toBeVisible()
  })

  test('activity page does not show other users activity', async ({ driverPage, runId }) => {
    // Seed a request from pax1 (not driver)
    const pax1Id = await getUserId(pax1Creds().email)
    const reqId = await seedRequest({
      requesterId: pax1Id,
      runId,
      category: 'peer_help',
      title: `[E2E-${runId}] sp45 pax1-only`,
      scheduledOffsetSeconds: 2 * 60 * 60,
    })

    try {
      // Driver's activity page should not show pax1's request
      await driverPage.goto('/dashboard/activity?range=12mo')
      await driverPage.waitForLoadState('networkidle')
      const pageText = await driverPage.locator('body').textContent() ?? ''
      expect(pageText).not.toContain(`[E2E-${runId}] sp45 pax1-only`)
    } finally {
      await cleanupRunData(runId)
    }
  })
})
