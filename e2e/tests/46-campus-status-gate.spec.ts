/**
 * Spec 46 — Campus status gate on signup
 *
 * Verifies that get_campus_for_domain() returns the correct status for known
 * domains and that the signup page blocks waitlist/disabled/unsupported domains
 * with a user-friendly message while letting active_beta and whitelisted
 * non-.edu addresses proceed.
 *
 * Tests:
 *  1.  DB: tamu.edu → active_beta
 *  2.  DB: utdallas.edu → active_beta
 *  3.  DB: uh.edu → waitlist
 *  4.  DB: utsa.edu → waitlist
 *  5.  DB: unknownuniv.edu → null (unsupported)
 *  6.  UI: waitlist .edu domain shows blocked message and contact info
 *  7.  UI: unsupported .edu domain shows blocked message
 *  8.  UI: whitelisted non-.edu bypasses campus check (reaches password validation)
 *  9.  UI: active_beta domain is not blocked by campus check (reaches Supabase)
 * 10.  DB: is_email_whitelisted still returns true for known approved emails (regression)
 */

import { test, expect } from '../helpers/fixtures'
import { adminClient } from '../helpers/db'

// ─── DB-level helpers ─────────────────────────────────────────────────────────

async function getCampusForDomain(domain: string): Promise<{ campus_id: string | null; campus_status: string | null } | null> {
  const db = adminClient()
  const { data, error } = await db.rpc('get_campus_for_domain', { p_domain: domain })
  if (error) throw new Error(`get_campus_for_domain failed: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

// ─── UI helper: fill and submit signup form ───────────────────────────────────

async function fillAndSubmitSignup(
  page: import('@playwright/test').Page,
  email: string,
  // Must be ≥10 chars to pass HTML5 minLength, but lack a special char to fail JS validation
  password = 'TenCharsABC',
) {
  await page.goto('/signup')
  await page.locator('#name').fill('E2E Test User')
  await page.locator('[data-testid="email-input"]').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#university').fill('Test University')
  await page.locator('#major').fill('CS')
  await page.locator('#year').selectOption('Junior')
  await page.locator('[data-testid="signup-submit-btn"]').click()
}

test.describe('Campus status gate', () => {

  // ── DB: active_beta campuses ───────────────────────────────────────────────

  test('DB: tamu.edu is active_beta', async () => {
    const row = await getCampusForDomain('tamu.edu')
    expect(row).not.toBeNull()
    expect(row!.campus_status).toBe('active_beta')
  })

  test('DB: utdallas.edu is active_beta', async () => {
    const row = await getCampusForDomain('utdallas.edu')
    expect(row).not.toBeNull()
    expect(row!.campus_status).toBe('active_beta')
  })

  // ── DB: waitlist campuses ─────────────────────────────────────────────────

  test('DB: uh.edu is waitlist', async () => {
    const row = await getCampusForDomain('uh.edu')
    expect(row).not.toBeNull()
    expect(row!.campus_status).toBe('waitlist')
  })

  test('DB: utsa.edu is waitlist', async () => {
    const row = await getCampusForDomain('utsa.edu')
    expect(row).not.toBeNull()
    expect(row!.campus_status).toBe('waitlist')
  })

  // ── DB: unsupported domain ────────────────────────────────────────────────

  test('DB: unrecognized .edu domain returns null', async () => {
    const row = await getCampusForDomain('unknownunivxyz999.edu')
    expect(row).toBeNull()
  })

  // ── UI: waitlist domain shows friendly block message ─────────────────────

  test('UI: waitlist .edu domain is blocked with waitlist message', async ({ page }) => {
    await fillAndSubmitSignup(page, 'student@uh.edu')

    const errEl = page.locator('[data-testid="signup-error"]')
    await expect(errEl).toBeVisible({ timeout: 15_000 })
    const text = await errEl.textContent()
    expect(text).toContain("isn't live")

    // Secondary contact info box should appear
    await expect(page.locator('[data-testid="campus-waitlist-msg"]')).toBeVisible()
  })

  // ── UI: unsupported domain shows friendly block message ───────────────────

  test('UI: unsupported .edu domain is blocked with unsupported message', async ({ page }) => {
    await fillAndSubmitSignup(page, 'student@unknownunivxyz999.edu')

    const errEl = page.locator('[data-testid="signup-error"]')
    await expect(errEl).toBeVisible({ timeout: 15_000 })
    const text = await errEl.textContent()
    expect(text).toContain("isn't available")
  })

  // ── UI: whitelisted non-.edu bypasses campus check ────────────────────────

  test('UI: whitelisted non-.edu bypasses campus check and reaches password step', async ({ page }) => {
    // 10-char no-special-char password passes HTML5 minLength but fails JS validation
    await fillAndSubmitSignup(page, 'anand.slate@gmail.com')

    const errEl = page.locator('[data-testid="signup-error"]')
    await expect(errEl).toBeVisible({ timeout: 15_000 })
    const text = await errEl.textContent() ?? ''

    // Campus messages must NOT appear — we got past the campus gate
    expect(text).not.toContain("isn't live")
    expect(text).not.toContain("isn't available")
    expect(text).not.toContain('not currently available')

    // Campus secondary msg must not appear
    await expect(page.locator('[data-testid="campus-waitlist-msg"]')).not.toBeVisible()

    // Should hit password validation error (special character or length)
    expect(text.toLowerCase()).toMatch(/password|special/)
  })

  // ── UI: active_beta domain is not blocked ────────────────────────────────

  test('UI: active_beta .edu domain is not blocked by campus check', async ({ page }) => {
    // 10-char no-special-char password passes HTML5 minLength but fails JS validation
    await fillAndSubmitSignup(page, 'student@tamu.edu')

    const errEl = page.locator('[data-testid="signup-error"]')
    await expect(errEl).toBeVisible({ timeout: 15_000 })
    const text = await errEl.textContent() ?? ''

    // Campus messages must NOT appear
    expect(text).not.toContain("isn't live")
    expect(text).not.toContain("isn't available")
    expect(text).not.toContain('not currently available')

    await expect(page.locator('[data-testid="campus-waitlist-msg"]')).not.toBeVisible()

    // Should hit password validation error (special character or length)
    expect(text.toLowerCase()).toMatch(/password|special/)
  })

  // ── DB: whitelist regression ──────────────────────────────────────────────

  test('DB: is_email_whitelisted still returns true for anand.slate@gmail.com', async () => {
    const db = adminClient()
    const { data, error } = await db.rpc('is_email_whitelisted', { p_email: 'anand.slate@gmail.com' })
    if (error) throw new Error(`is_email_whitelisted failed: ${error.message}`)
    expect(!!data).toBe(true)
  })
})
