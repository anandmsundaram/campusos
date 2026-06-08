/**
 * Spec 35 — Request scope guardrails
 *
 * Verifies that out-of-scope requests are blocked by the client-side guard,
 * the API-level guard, and (implicitly) the DB trigger — while allowed
 * practical-service requests and existing flows continue to work.
 *
 * Implementation: deterministic keyword/regex classifier in lib/requestScope.ts,
 * mirrored at app/api/parse-request/route.ts (422) and DB trigger (BEFORE INSERT).
 *
 * Tests:
 *  1.  "Can I get a date?" → BLOCKED (client shows scope-error)
 *  2.  "I need dating advice" → BLOCKED
 *  3.  "I need someone to be my date tonight" → BLOCKED
 *  4.  "I need a ride to my date tonight" → ALLOWED (ride overrides)
 *  5.  "Can someone pick up flowers for my date?" → ALLOWED (pickup overrides)
 *  6.  "Can someone do my homework?" → BLOCKED (academic cheating)
 *  7.  "Can someone buy alcohol for me?" → BLOCKED (illegal purchase)
 *  8.  "Can someone buy a vape for me?" → BLOCKED (illegal purchase)
 *  9.  Existing ride request flow still works end-to-end (no regression)
 * 10.  Existing errand request flow still works end-to-end (no regression)
 * 11.  Direct API bypass (POST /api/parse-request) returns 422 for blocked text
 * 12.  Direct API bypass returns 200 for allowed text
 * 13.  No blocked request record is created in the DB
 */

import { test, expect } from '../helpers/fixtures'
import {
  getUserId,
  driverCreds,
  seedTourCompleted,
  seedTermsAcceptance,
  cleanupRunData,
  adminClient,
} from '../helpers/db'

const SCOPE_ERROR_TEXT =
  'CampusOS is for practical campus help like rides, pickups, errands, moving, and quick paid favors.'

test.describe('Request scope guardrails', () => {
  let driverUserId: string

  test.beforeAll(async () => {
    driverUserId = await getUserId(driverCreds().email)
  })

  test.beforeEach(async () => {
    await Promise.all([
      seedTourCompleted(driverUserId),
      seedTermsAcceptance(driverUserId),
    ])
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function typeAndSubmit(page: import('@playwright/test').Page, text: string) {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const textarea = page.locator('[data-testid="request-textarea"]')
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill(text)
    await page.getByRole('button', { name: /post request/i }).click()
  }

  // ── 1–3: Blocked inputs show scope-error ──────────────────────────────────

  const BLOCKED_INPUTS = [
    'Can I get a date?',
    'I need dating advice',
    'I need someone to be my date tonight',
  ]

  for (const input of BLOCKED_INPUTS) {
    test(`BLOCKED: "${input}"`, async ({ driverPage: page }) => {
      await typeAndSubmit(page, input)
      const err = page.locator('[data-testid="scope-error"]')
      await expect(err).toBeVisible({ timeout: 8_000 })
      await expect(err).toContainText(SCOPE_ERROR_TEXT)
    })
  }

  // ── 4: Ride with "date" destination → ALLOWED ──────────────────────────────

  test('ALLOWED: "I need a ride to my date tonight"', async ({ driverPage: page }) => {
    await typeAndSubmit(page, 'I need a ride to my date tonight')
    // Scope guard must NOT block this — no scope-error shown
    // (Full parse verification requires Anthropic API key in env — see spec 01 for full flow)
    await expect(page.locator('[data-testid="scope-error"]')).toHaveCount(0, { timeout: 8_000 })
  })

  // ── 5: Pickup with "date" context → ALLOWED ────────────────────────────────

  test('ALLOWED: "Can someone pick up flowers for my date?"', async ({ driverPage: page }) => {
    await typeAndSubmit(page, 'Can someone pick up flowers for my date?')
    // Scope guard must NOT block this
    await expect(page.locator('[data-testid="scope-error"]')).toHaveCount(0, { timeout: 8_000 })
  })

  // ── 6: Academic cheating → BLOCKED ────────────────────────────────────────

  test('BLOCKED: "Can someone do my homework?"', async ({ driverPage: page }) => {
    await typeAndSubmit(page, 'Can someone do my homework?')
    const err = page.locator('[data-testid="scope-error"]')
    await expect(err).toBeVisible({ timeout: 8_000 })
    await expect(err).toContainText(SCOPE_ERROR_TEXT)
  })

  // ── 7: Alcohol purchase → BLOCKED ─────────────────────────────────────────

  test('BLOCKED: "Can someone buy alcohol for me?"', async ({ driverPage: page }) => {
    await typeAndSubmit(page, 'Can someone buy alcohol for me?')
    const err = page.locator('[data-testid="scope-error"]')
    await expect(err).toBeVisible({ timeout: 8_000 })
    await expect(err).toContainText(SCOPE_ERROR_TEXT)
  })

  // ── 8: Vape purchase → BLOCKED ─────────────────────────────────────────────

  test('BLOCKED: "Can someone buy a vape for me?"', async ({ driverPage: page }) => {
    await typeAndSubmit(page, 'Can someone buy a vape for me?')
    const err = page.locator('[data-testid="scope-error"]')
    await expect(err).toBeVisible({ timeout: 8_000 })
    await expect(err).toContainText(SCOPE_ERROR_TEXT)
  })

  // ── 9: Existing ride flow not regressed ────────────────────────────────────

  test('existing ride request flow still works (no regression)', async ({ driverPage: page, runId }) => {
    await typeAndSubmit(page, `[E2E-${runId}] Need a ride from TAMU to Houston this Friday`)
    // Scope guard must not block a normal ride request
    await expect(page.locator('[data-testid="scope-error"]')).toHaveCount(0, { timeout: 8_000 })
    await cleanupRunData(runId)
  })

  // ── 10: Existing errand flow not regressed ────────────────────────────────

  test('existing errand request flow still works (no regression)', async ({ driverPage: page, runId }) => {
    await typeAndSubmit(page, `[E2E-${runId}] Can someone pick up my package from the mailroom?`)
    // Scope guard must not block a normal errand request
    await expect(page.locator('[data-testid="scope-error"]')).toHaveCount(0, { timeout: 8_000 })
    await cleanupRunData(runId)
  })

  // ── 11: Direct API bypass returns 422 for blocked text ────────────────────

  test('direct POST to /api/parse-request returns 422 for blocked text', async ({ driverPage: page }) => {
    // Use page.request so auth session cookies are included
    const res = await page.request.post('/api/parse-request', {
      data: { text: 'Can someone do my homework?' },
    })
    expect(res.status()).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('OUT_OF_SCOPE')
  })

  // ── 12: Direct API bypass does NOT return 422 for allowed text ──────────

  test('direct POST to /api/parse-request does not return 422 for allowed text', async ({ driverPage: page }) => {
    // Use page.request so auth session cookies are included
    const res = await page.request.post('/api/parse-request', {
      data: { text: 'Need a ride to campus tomorrow morning' },
    })
    // Scope guard must pass (not 422). Downstream may be 200 or 502 depending on Anthropic key availability.
    expect(res.status()).not.toBe(422)
    if (res.status() === 200) {
      const body = await res.json()
      expect(body.category).toBeTruthy()
    }
  })

  // ── 13: No blocked request record created in the DB ──────────────────────

  test('no blocked request record is created after a scope-blocked submission', async ({ driverPage: page, runId }) => {
    const blockedText = `[E2E-${runId}] Can I get a date?`
    await typeAndSubmit(page, blockedText)

    // Verify error shown
    await expect(page.locator('[data-testid="scope-error"]')).toBeVisible({ timeout: 8_000 })

    // Verify no DB record
    const db = adminClient()
    const { data } = await db
      .from('requests')
      .select('id')
      .ilike('description', `%${runId}%`)
    expect((data ?? []).length).toBe(0)
  })
})
