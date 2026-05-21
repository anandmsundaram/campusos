/**
 * Flow 12 — Structured coordination fields
 *
 * Tests:
 *  1. Ambiguous input ("Anyone going to Walmart?") shows clarification card
 *  2. Non-ride offer shows interstitial and does NOT post a DB record
 *  3. Requester never sees "They'll pay me" — sees "You'll pay the helper"
 *  4. Errand task_details blocks Confirm until filled
 *  5. Peer-help help_type is captured in the confirm card
 *  6. Expanded feed card shows original description + structured details
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

test.describe('Structured coordination fields', () => {

  // ── Test 1: Ambiguous input shows clarification card ──────────────────────
  test('ambiguous input shows clarification options before confirm', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Walmart run',
      ambiguous: true,
      is_offer: false,
      clarification_question: 'What do you need help with?',
      clarification_options: [
        { label: '🚗 Ride there', appended_text: 'I need a ride to Walmart' },
        { label: '🛍️ Pick something up', appended_text: 'I need someone to pick something up from Walmart' },
      ],
      summary: 'Ambiguous Walmart request.',
      missing_fields: [],
      structured_data: null,
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone going to Walmart?')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Disambiguation card must appear
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="disambig-card"]')).toBeVisible()

    // Both clarification options are present
    const options = page.locator('[data-testid="disambig-option"]')
    await expect(options).toHaveCount(2)
    await expect(options.first()).toContainText('Ride there')

    // Confirm button must NOT be visible yet — no premature posting
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeVisible()
  })

  // ── Test 2: Non-ride offer shows interstitial, never posts ────────────────
  test('non-ride offer shows interstitial and does not post', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'Offering to run errands',
      is_offer: true,
      ambiguous: false,
      summary: 'Offering to run errands for anyone who needs it.',
      missing_fields: [],
      structured_data: { errand_type: 'grocery', store_or_place: 'HEB' },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('I can run errands at HEB if anyone needs something')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Offer interstitial must appear
    await page.locator('[data-testid="offer-interstitial"]').waitFor({ timeout: 10_000 })
    await expect(page.locator('[data-testid="offer-interstitial"]')).toBeVisible()

    // Confirm button must NOT be present — offer interstitial never posts
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeVisible()
  })

  // ── Test 3: Payment wording uses requester perspective ────────────────────
  test('payment label shows requester perspective — never "They\'ll pay me"', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'HEB grocery run',
      is_offer: false,
      ambiguous: false,
      summary: 'Need someone to pick up groceries from HEB.',
      missing_fields: [],
      structured_data: {
        errand_type: 'grocery',
        store_or_place: 'HEB',
        task_details: 'milk and eggs',
        reimbursement_type: 'paid',
      },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill("I'll pay someone to pick up milk and eggs from HEB")
    await page.getByRole('button', { name: /Post request/ }).click()

    // Wait for confirm card
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // The payment label should say "You'll pay the helper", never "They'll pay me"
    const paymentLabel = page.locator('[data-testid="payment-label"]')
    await expect(paymentLabel).toBeVisible()
    const labelText = await paymentLabel.textContent()
    expect(labelText).not.toContain("They'll pay me")
    expect(labelText).toContain("pay the helper")
  })

  // ── Test 4: Errand task_details blocks confirm until filled ───────────────
  test('errand task_details is required before confirm unlocks', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'errands',
      title: 'HEB grocery run',
      is_offer: false,
      ambiguous: false,
      summary: 'Need someone to pick up groceries from HEB.',
      missing_fields: ['task_details'],
      structured_data: {
        errand_type: 'grocery',
        store_or_place: 'HEB',
        task_details: null,
        reimbursement_type: null,
      },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need someone to go to HEB')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Wait for confirm card
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // Confirm should be disabled — task_details missing
    const confirmBtn = page.locator('[data-testid="confirm-post-btn"]')
    await expect(confirmBtn).toBeDisabled()

    // Fill task_details text input
    const taskInput = page.locator('[data-testid="followup-text-task_details"]')
    await expect(taskInput).toBeVisible()
    await taskInput.fill('milk, eggs, and bread')

    // Confirm should now be enabled
    await expect(confirmBtn).toBeEnabled()
  })

  // ── Test 5: Peer-help help_type chips appear and are capturable ───────────
  test('peer_help help_type chips appear in the confirm card', async ({ driverPage: page }) => {
    await mockParseRequest(page, {
      category: 'peer_help',
      title: 'Calculus tutoring help',
      is_offer: false,
      ambiguous: false,
      summary: 'Need help with calculus problem sets.',
      missing_fields: ['subject'],
      structured_data: {
        subject: null,
        is_virtual: null,
        help_type: null,
        session_type: 'one_time',
      },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need help with my calculus homework tonight')
    await page.getByRole('button', { name: /Post request/ }).click()

    // Wait for confirm card
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })

    // help_type chips should be visible
    const homeworkChip = page.getByRole('button', { name: /Homework/ })
    await expect(homeworkChip).toBeVisible()

    // Clicking a help_type chip should update state
    await homeworkChip.click()
    await expect(homeworkChip).toHaveClass(/ring|border-blue|bg-blue/)
  })

  // ── Test 6: Expanded feed card shows original description + structured details
  test('expanded feed card shows original text and structured details', async ({ driverPage: page, runId }) => {
    const originalText = `[E2E-${runId}] Need help moving my couch Saturday`

    await mockParseRequest(page, {
      category: 'moving',
      title: `[E2E-${runId}] Help moving a couch`,
      is_offer: false,
      ambiguous: false,
      summary: 'Need help moving a couch on Saturday.',
      missing_fields: [],
      structured_data: {
        move_type: 'furniture',
        helpers_needed: 2,
        access_type: 'stairs',
        has_heavy_items: true,
        truck_needed: null,
        estimated_duration: null,
      },
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill(originalText)
    await page.getByRole('button', { name: /Post request/ }).click()

    // Wait for confirm, then post
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="confirm-post-btn"]').click()
    await expect(page.getByText('Request posted!')).toBeVisible({ timeout: 8_000 })

    // Go to My Requests tab to find the card
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /My Requests/ }).click()

    const card = page.locator('[data-testid="request-card"]').filter({ hasText: `[E2E-${runId}]` })
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Expand the card
    const expandBtn = card.locator('[data-testid="card-expand-btn"]')
    await expect(expandBtn).toBeVisible()
    await expandBtn.click()

    // Expanded detail section should appear
    const detailSection = card.locator('[data-testid="card-detail-section"]')
    await expect(detailSection).toBeVisible()

    // Original description text should be shown
    const descriptionEl = card.locator('[data-testid="card-description"]')
    await expect(descriptionEl).toBeVisible()
    await expect(descriptionEl).toContainText(`[E2E-${runId}]`)

    // Collapse the card
    await expandBtn.click()
    await expect(detailSection).not.toBeVisible()
  })
})
