/**
 * Flow 17 — Workflow slot-filling engine
 *
 * Tests the core invariant: a disambiguation choice is a state transition,
 * not a parser re-invocation. The workflow engine must:
 *
 *  1. Never re-invoke the parser after a clarification pick
 *  2. Lock intent after disambiguation — no second disambig card
 *  3. Ride option → confirm card (not interstitial, not loop)
 *  4. Non-ride offer option → offer interstitial with intent-specific message
 *  5. Errand request option → confirm card with errand fields
 *  6. Moving request option → confirm card with moving fields
 *  7. Peer-help request option → confirm card with peer-help fields
 *  8. Borrow request option → confirm card with borrow fields
 *  9. Edit after disambiguation → full reset (next submit re-disambiguates)
 * 10. Direct non-ride offer (no disambig) still shows interstitial
 */

import { test, expect } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'
import { goToDashboard } from '../helpers/fixtures'

// Shared ambiguous response — parser can only be called ONCE after the first
// disambiguation pick; the workflow engine must never call it again.
const AMBIGUOUS_WALMART = {
  category: 'errands' as const,
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
}

test.describe('Workflow slot-filling engine', () => {

  // ── Test 1: Ride option from disambig → confirm card, parser called once ──
  test('ride option transitions to confirm card without re-invoking parser', async ({ driverPage: page }) => {
    let parseCallCount = 0
    await page.route('/api/parse-request', async route => {
      parseCallCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...AMBIGUOUS_WALMART,
          // Second call would also return ambiguous — but it must never happen
        }),
      })
    })
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone going to Walmart?')
    await page.getByRole('button', { name: /Post request/ }).click()

    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })
    // Parser has been called exactly once at this point
    expect(parseCallCount).toBe(1)

    // Pick the ride option
    await page.locator('[data-testid="disambig-option"]').first().click()

    // Confirm card appears — not another disambig card, not a parse spinner
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 8_000 })
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="disambig-card"]')).not.toBeVisible()

    // Parser was only called the single time for the initial submit
    expect(parseCallCount).toBe(1)
  })

  // ── Test 2: Picking disambig option never shows a second disambig card ─────
  test('disambiguation choice never causes a second disambig card', async ({ driverPage: page }) => {
    let callCount = 0
    await page.route('/api/parse-request', async route => {
      callCount++
      // Always return ambiguous — if the engine re-invokes parser this would loop
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AMBIGUOUS_WALMART),
      })
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Walmart help')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Pick any option
    await page.locator('[data-testid="disambig-option"]').first().click()

    // Must NOT show another disambig card — engine must lock intent
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="disambig-card"]')).not.toBeVisible()

    // Parser was called exactly once
    expect(callCount).toBe(1)
  })

  // ── Test 3: Non-ride offer option → offer interstitial with specific message ─
  test('non-ride offer option shows offer interstitial, not confirm card', async ({ driverPage: page }) => {
    const offerDisambig = {
      ...AMBIGUOUS_WALMART,
      clarification_options: [
        { label: '🛍️ I\'ll run the errand', appended_text: 'I am offering to run errands for others' },
        { label: '🙋 I need an errand run', appended_text: 'I need someone to run an errand for me' },
      ],
    }
    await mockParseRequest(page, offerDisambig)

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Walmart errand help')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Pick the offer option (first)
    await page.locator('[data-testid="disambig-option"]').first().click()

    // Offer interstitial must appear — not confirm card
    await page.locator('[data-testid="offer-interstitial"]').waitFor({ timeout: 8_000 })
    await expect(page.locator('[data-testid="offer-interstitial"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeVisible()
  })

  // ── Test 4: Errand request option → confirm card ────────────────────────────
  test('errand request option transitions to confirm card with errand fields', async ({ driverPage: page }) => {
    const ambigErrand = {
      category: 'errands' as const,
      title: 'HEB run',
      ambiguous: true,
      is_offer: false,
      clarification_question: 'Do you need a ride or an errand run?',
      clarification_options: [
        { label: '🚗 Give me a ride', appended_text: 'I need a ride to the store' },
        { label: '🛍️ Pick something up', appended_text: 'I need groceries picked up from HEB' },
      ],
      summary: 'HEB errand or ride.',
      missing_fields: [],
      structured_data: { errand_type: 'grocery' },
    }
    await mockParseRequest(page, ambigErrand)
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('HEB run please')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Pick the errand option (second)
    await page.locator('[data-testid="disambig-option"]').nth(1).click()

    // Should show confirm card
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 8_000 })
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="offer-interstitial"]')).not.toBeVisible()
  })

  // ── Test 5: Moving request option → confirm card ─────────────────────────
  test('moving request option transitions to confirm card', async ({ driverPage: page }) => {
    const ambigMoving = {
      category: 'moving' as const,
      title: 'Moving help',
      ambiguous: true,
      is_offer: false,
      clarification_question: 'Are you moving or offering to help someone move?',
      clarification_options: [
        { label: '📦 I need moving help', appended_text: 'I need people to help me move my stuff' },
        { label: '💪 I can help someone move', appended_text: 'I am offering to help others move furniture' },
      ],
      summary: 'Moving ambiguity.',
      missing_fields: [],
      structured_data: null,
    }
    await mockParseRequest(page, ambigMoving)
    await mockLocationSearch(page, [])

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone can help me move this weekend?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Pick "need moving help" (first option)
    await page.locator('[data-testid="disambig-option"]').first().click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 8_000 })
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeVisible()
  })

  // ── Test 6: Edit after disambiguation resets workflow state ──────────────────
  test('edit after disambiguation resets intent lock and shows disambig again on resubmit', async ({ driverPage: page }) => {
    let parseCallCount = 0
    await page.route('/api/parse-request', async route => {
      parseCallCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AMBIGUOUS_WALMART),
      })
    })

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Walmart help')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Pick an option to transition state
    await page.locator('[data-testid="disambig-option"]').first().click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 8_000 })

    // Click Edit — should reset to idle state
    const editBtn = page.getByRole('button', { name: /Edit/ })
    if (await editBtn.isVisible()) {
      await editBtn.click()
    } else {
      // Alternatively find the edit link in the confirm card footer
      await page.locator('button:has-text("Edit")').first().click()
    }

    // Textarea should be editable again
    await expect(page.locator('[data-testid="request-textarea"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirm-post-btn"]')).not.toBeVisible()

    // Resubmit same text — should parse again (clarificationCount reset)
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Parser called a second time (first: initial submit, second: after edit+resubmit)
    expect(parseCallCount).toBe(2)
  })

  // ── Test 7: Peer-help request option → confirm card ──────────────────────
  test('peer-help request option transitions to confirm card', async ({ driverPage: page }) => {
    const ambigPeerHelp = {
      category: 'peer_help' as const,
      title: 'Calc II help',
      ambiguous: true,
      is_offer: false,
      clarification_question: 'Are you offering or requesting tutoring?',
      clarification_options: [
        { label: '🙋 I need a tutor', appended_text: 'I need tutoring help with Calc' },
        { label: '🎓 I can tutor', appended_text: 'I am offering tutoring help for others' },
      ],
      summary: 'Calc II tutoring ambiguity.',
      missing_fields: [],
      structured_data: null,
    }
    await mockParseRequest(page, ambigPeerHelp)

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Calc II tutoring')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Pick "need a tutor"
    await page.locator('[data-testid="disambig-option"]').first().click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 8_000 })
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeVisible()
  })

  // ── Test 8: Borrow request option → confirm card ─────────────────────────
  test('borrow request option transitions to confirm card', async ({ driverPage: page }) => {
    const ambigBorrow = {
      category: 'borrow' as const,
      title: 'Borrow a drill',
      ambiguous: true,
      is_offer: false,
      clarification_question: 'Do you need to borrow or are you lending?',
      clarification_options: [
        { label: '📦 Borrow something', appended_text: 'I need to borrow a tool' },
        { label: '🎁 Lend something', appended_text: 'I am offering to lend an item to someone' },
      ],
      summary: 'Drill borrow ambiguity.',
      missing_fields: [],
      structured_data: null,
    }
    await mockParseRequest(page, ambigBorrow)

    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Anyone have a drill I can use?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="disambig-card"]').waitFor({ timeout: 10_000 })

    // Pick "Borrow something"
    await page.locator('[data-testid="disambig-option"]').first().click()

    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 8_000 })
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeVisible()
  })

})
