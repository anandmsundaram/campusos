/**
 * Spec 34 — Email whitelist and signup validation
 *
 * Verifies that the email_whitelist table + is_email_whitelisted() function
 * enforces the correct rules:
 *  - .edu addresses always pass (handled by signup page before RPC call)
 *  - Pre-approved non-.edu addresses pass
 *  - Non-approved non-.edu addresses are blocked
 *  - Matching is case-insensitive and whitespace-trimmed
 *
 * DB-level tests use the admin client to call is_email_whitelisted() directly.
 * UI-level tests open an unauthenticated signup page to verify error messages.
 *
 * NOTE: We do NOT submit a full signup for real production emails because that
 * would try to create accounts and send confirmation emails.  The DB-level
 * tests confirm the whitelist logic is correct for those emails.
 *
 * Tests:
 *  1.  lakshmi175@gmail.com is whitelisted
 *  2.  anand.slate@gmail.com is whitelisted
 *  3.  campusvoice@gmail.com is whitelisted
 *  4.  sanjanaanandtx@gmail.com is whitelisted
 *  5.  Uppercase version of allowlisted email is still whitelisted
 *  6.  Whitespace-padded allowlisted email is still whitelisted
 *  7.  Non-approved Gmail is NOT whitelisted
 *  8.  Arbitrary non-.edu address is NOT whitelisted
 *  9.  UI: non-approved Gmail shows the correct block error on submit
 * 10.  UI: .edu email is not blocked by whitelist (proceeds past email check)
 */

import { test, expect } from '../helpers/fixtures'
import { adminClient } from '../helpers/db'

const APPROVED_EMAILS = [
  'lakshmi175@gmail.com',
  'anand.slate@gmail.com',
  'campusvoice@gmail.com',
  'sanjanaanandtx@gmail.com',
]

async function isWhitelisted(email: string): Promise<boolean> {
  const db = adminClient()
  const { data, error } = await db.rpc('is_email_whitelisted', { p_email: email })
  if (error) throw new Error(`is_email_whitelisted RPC failed: ${error.message}`)
  return !!data
}

test.describe('Email whitelist', () => {

  // ── 1–4: All known approved Gmail addresses are whitelisted ────────────────

  for (const email of APPROVED_EMAILS) {
    test(`approved email is whitelisted: ${email}`, async () => {
      expect(await isWhitelisted(email)).toBe(true)
    })
  }

  // ── 5: Case-insensitive matching ───────────────────────────────────────────

  test('uppercase version of allowlisted email is still whitelisted', async () => {
    const upper = 'ANAND.SLATE@GMAIL.COM'
    expect(await isWhitelisted(upper)).toBe(true)
  })

  // ── 6: Whitespace trimming ────────────────────────────────────────────────

  test('whitespace-padded allowlisted email is still whitelisted', async () => {
    const padded = '  lakshmi175@gmail.com  '
    expect(await isWhitelisted(padded)).toBe(true)
  })

  // ── 7: Non-approved Gmail is blocked ──────────────────────────────────────

  test('non-approved Gmail is NOT whitelisted', async () => {
    expect(await isWhitelisted('notapproved@gmail.com')).toBe(false)
  })

  // ── 8: Arbitrary non-.edu address is blocked ─────────────────────────────

  test('arbitrary non-.edu address is NOT whitelisted', async () => {
    expect(await isWhitelisted('someone@yahoo.com')).toBe(false)
  })

  // ── 9: UI shows correct error for non-approved Gmail ─────────────────────

  test('UI blocks non-approved Gmail with correct error message', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/signup')
      await page.waitForLoadState('networkidle')

      // Fill all required fields
      await page.fill('[data-testid="email-input"]', 'notapproved@gmail.com')
      await page.fill('input[id="name"]', 'Test User')
      await page.fill('input[id="password"]', 'StrongPass1!')
      await page.fill('input[id="university"]', 'State University')
      await page.fill('input[id="major"]', 'CS')
      await page.selectOption('select[id="year"]', 'Freshman')

      await page.click('[data-testid="signup-submit-btn"]')

      const errorEl = page.locator('[data-testid="signup-error"]')
      await expect(errorEl).toBeVisible({ timeout: 10_000 })
      await expect(errorEl).toContainText('Use a .edu email, or ask us to pre-approve this email.')
    } finally {
      await ctx.close()
    }
  })

  // ── 10: .edu email suppresses the inline "not a .edu" warning ───────────

  test('UI shows no inline error for .edu email (client-side validation allows it)', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto('/signup')
      await page.waitForLoadState('networkidle')

      // Fill the email field with a .edu address and blur it
      const emailInput = page.locator('[data-testid="email-input"]')
      await emailInput.fill('student@ut.edu')
      await emailInput.blur()

      // The inline "Must be a .edu address or pre-approved email" hint must NOT appear
      await expect(page.locator('[data-testid="email-inline-error"]')).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })
})
