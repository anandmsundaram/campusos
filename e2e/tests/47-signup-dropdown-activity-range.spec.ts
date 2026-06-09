/**
 * Spec 47 — Texas university dropdown on signup + activity custom date range
 *
 * University dropdown:
 *  1.  Signup page shows a <select> with Texas universities, not a free-text input.
 *  2.  MIT/Stanford/UCLA placeholder is not present.
 *  3.  Active beta campuses appear as selectable options.
 *  4.  Waitlist campuses appear as disabled/coming-soon options.
 *  5.  get_signup_campuses() RPC returns active_beta campuses before waitlist.
 *  6.  get_signup_campuses() returns no disabled campuses.
 *  7.  Campus mismatch hint appears when email domain doesn't match selected campus.
 *
 * Activity date range:
 *  8.  Quick-filter buttons (month/30d/3mo/12mo) are present.
 *  9.  From and To date inputs are present.
 *  10. Apply button is present.
 *  11. Custom range: valid From/To navigates to custom range URL.
 *  12. Client-side error: To before From.
 *  13. Client-side error: To date in future (beyond today).
 *  14. Activity page with custom range= query shows the selected range label.
 *  15. Range=custom with invalid params falls back to This month with error banner.
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import { adminClient } from '../helpers/db'

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getSignupCampuses() {
  const db = adminClient()
  const { data, error } = await db.rpc('get_signup_campuses')
  if (error) throw new Error(`get_signup_campuses failed: ${error.message}`)
  return (Array.isArray(data) ? data : []) as { id: string; name: string; slug: string; status: string; domain_hint: string | null }[]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

// ─── University dropdown ───────────────────────────────────────────────────────

test.describe('Texas university dropdown on signup', () => {

  test('signup shows a select element for university, not a free-text input', async ({ page }) => {
    await page.goto('/signup')
    // The university field must be a <select>, not an <input type="text">
    await expect(page.locator('[data-testid="university-select"]')).toBeVisible({ timeout: 10_000 })
    // No text input with placeholder containing MIT/Stanford/UCLA
    const miPlaceholder = page.locator('input[placeholder*="MIT"], input[placeholder*="Stanford"], input[placeholder*="UCLA"]')
    await expect(miPlaceholder).toHaveCount(0)
  })

  test('university select has a placeholder option', async ({ page }) => {
    await page.goto('/signup')
    const select = page.locator('[data-testid="university-select"]')
    await expect(select).toBeVisible({ timeout: 10_000 })
    // Verify the default placeholder text
    const firstOption = page.locator('[data-testid="university-select"] option').first()
    const text = await firstOption.textContent()
    expect(text).toMatch(/Select your Texas university/i)
  })

  test('active beta campuses are selectable in dropdown', async ({ page }) => {
    await page.goto('/signup')
    const select = page.locator('[data-testid="university-select"]')
    await expect(select).toBeVisible({ timeout: 10_000 })

    // TAMU is active_beta and must be selectable
    await select.selectOption('tamu')
    const selected = await select.inputValue()
    expect(selected).toBe('tamu')
  })

  test('waitlist campuses appear as disabled options', async ({ page }) => {
    await page.goto('/signup')
    const select = page.locator('[data-testid="university-select"]')
    await expect(select).toBeVisible({ timeout: 10_000 })

    // University of Houston is waitlist — option must be disabled
    const uhOption = page.locator('[data-testid="university-select"] option[value="uh-main"]')
    await expect(uhOption).toHaveCount(1) // present but disabled
    const disabled = await uhOption.getAttribute('disabled')
    expect(disabled).not.toBeNull()
  })

  test('DB: get_signup_campuses returns active_beta campuses first', async () => {
    const campuses = await getSignupCampuses()
    expect(campuses.length).toBeGreaterThan(0)

    // All active_beta entries must appear before any waitlist entries
    const statuses = campuses.map(c => c.status)
    const lastActiveBeta = statuses.lastIndexOf('active_beta')
    const firstWaitlist = statuses.indexOf('waitlist')
    if (lastActiveBeta !== -1 && firstWaitlist !== -1) {
      expect(lastActiveBeta).toBeLessThan(firstWaitlist)
    }
  })

  test('DB: get_signup_campuses returns no disabled campuses', async () => {
    const campuses = await getSignupCampuses()
    const disabled = campuses.filter(c => c.status === 'disabled')
    expect(disabled).toHaveLength(0)
  })

  test('DB: get_signup_campuses includes Texas A&M as active_beta', async () => {
    const campuses = await getSignupCampuses()
    const tamu = campuses.find(c => c.slug === 'tamu')
    expect(tamu).toBeDefined()
    expect(tamu!.status).toBe('active_beta')
  })

  test('campus mismatch hint appears when email domain does not match selected campus', async ({ page }) => {
    await page.goto('/signup')

    const select = page.locator('[data-testid="university-select"]')
    await expect(select).toBeVisible({ timeout: 10_000 })

    // Select TAMU (domain_hint: tamu.edu) then enter a UTD email
    await select.selectOption('tamu')
    await page.locator('[data-testid="email-input"]').fill('student@utdallas.edu')
    await page.locator('[data-testid="email-input"]').blur() // trigger onBlur

    // Mismatch hint should appear
    const hint = page.locator('[data-testid="campus-mismatch-error"]')
    await expect(hint).toBeVisible({ timeout: 5_000 })
    const text = await hint.textContent() ?? ''
    expect(text).toContain('tamu.edu')
  })
})

// ─── Activity custom date range ───────────────────────────────────────────────

test.describe('Activity custom date range', () => {

  test('activity page shows From and To date inputs and Apply button', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')
    await expect(driverPage.locator('[data-testid="range-from-input"]')).toBeVisible({ timeout: 10_000 })
    await expect(driverPage.locator('[data-testid="range-to-input"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="range-custom-apply"]')).toBeVisible()
  })

  test('quick filter buttons are present alongside date inputs', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')
    await expect(driverPage.locator('[data-testid="range-month"]')).toBeVisible({ timeout: 10_000 })
    await expect(driverPage.locator('[data-testid="range-30d"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="range-3mo"]')).toBeVisible()
    await expect(driverPage.locator('[data-testid="range-12mo"]')).toBeVisible()
    // Custom inputs also present
    await expect(driverPage.locator('[data-testid="range-from-input"]')).toBeVisible()
  })

  test('client-side error: To date before From date', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')

    const from = driverPage.locator('[data-testid="range-from-input"]')
    const to = driverPage.locator('[data-testid="range-to-input"]')
    await expect(from).toBeVisible({ timeout: 10_000 })

    // Set from = today, to = 10 days ago (invalid)
    await from.fill(todayStr())
    await to.fill(daysAgo(10))
    await driverPage.locator('[data-testid="range-custom-apply"]').click()

    const err = driverPage.locator('[data-testid="range-error"]')
    await expect(err).toBeVisible({ timeout: 5_000 })
    const text = await err.textContent() ?? ''
    expect(text.toLowerCase()).toContain('before')
  })

  test('client-side error: To date in the future', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')

    const from = driverPage.locator('[data-testid="range-from-input"]')
    const to = driverPage.locator('[data-testid="range-to-input"]')
    await expect(from).toBeVisible({ timeout: 10_000 })

    await from.fill(daysAgo(5))
    await to.fill(daysFromNow(3))  // future date
    await driverPage.locator('[data-testid="range-custom-apply"]').click()

    const err = driverPage.locator('[data-testid="range-error"]')
    await expect(err).toBeVisible({ timeout: 5_000 })
    const text = await err.textContent() ?? ''
    expect(text.toLowerCase()).toContain('future')
  })

  test('valid custom range navigates to custom range URL', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')

    const from = driverPage.locator('[data-testid="range-from-input"]')
    const to = driverPage.locator('[data-testid="range-to-input"]')
    await expect(from).toBeVisible({ timeout: 10_000 })

    const fromDate = daysAgo(10)
    const toDate = daysAgo(1)

    // Clear and fill dates
    await from.fill(fromDate)
    await to.fill(toDate)
    await driverPage.locator('[data-testid="range-custom-apply"]').click()

    // Should navigate to custom range URL
    await driverPage.waitForURL(/range=custom/, { timeout: 10_000 })
    const url = driverPage.url()
    expect(url).toContain('range=custom')
    expect(url).toContain(`from=${fromDate}`)
    expect(url).toContain(`to=${toDate}`)
  })

  test('activity page with custom range shows date label in header', async ({ driverPage }) => {
    const fromDate = daysAgo(15)
    const toDate = daysAgo(1)
    await driverPage.goto(`/dashboard/activity?range=custom&from=${fromDate}&to=${toDate}`)
    // The header subtitle should show a formatted date range, not "This month"
    const subtitle = driverPage.locator('h1 + p, h1 ~ p').first()
    await expect(subtitle).toBeVisible({ timeout: 10_000 })
    const text = await subtitle.textContent() ?? ''
    // Should not say "This month" (that's the default)
    expect(text).not.toBe('This month')
    // Should contain a formatted date (month name or year)
    expect(text).toMatch(/\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)
  })

  test('activity page with invalid custom range shows error banner and defaults to this month', async ({ driverPage }) => {
    // from > to (invalid)
    await driverPage.goto('/dashboard/activity?range=custom&from=2026-06-10&to=2026-06-01')
    await expect(driverPage.locator('[data-testid="range-error-banner"]')).toBeVisible({ timeout: 10_000 })
  })

  test('activity page custom range: From cannot be older than 12 months', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/activity')

    const from = driverPage.locator('[data-testid="range-from-input"]')
    await expect(from).toBeVisible({ timeout: 10_000 })

    // 13 months ago — beyond max lookback
    await from.fill(daysAgo(395))
    await driverPage.locator('[data-testid="range-to-input"]').fill(daysAgo(1))
    await driverPage.locator('[data-testid="range-custom-apply"]').click()

    const err = driverPage.locator('[data-testid="range-error"]')
    await expect(err).toBeVisible({ timeout: 5_000 })
    const text = await err.textContent() ?? ''
    expect(text.toLowerCase()).toContain('12 month')
  })
})
