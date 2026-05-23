/**
 * Pre-card-flip QA gaps — COS-P25-PRE-CARD-FLIP-VERIFICATION
 *
 * Covers gaps NOT already verified by specs 19–23:
 *   2D. Moving request: time+payment+location → front card posts
 *   2E. Peer help request: payment gate → front card posts
 *   2F. Borrow request: no gates → confirm enabled → front card posts
 *
 * Sections 3 (time picker), 4 (cancel/retry), 5 (payment subflow),
 * 6 (offer/counter), 7 (front card) are all covered by specs 19-23 (45/45).
 *
 * Uses correct structured_data to pre-fill critical fields (CRITICAL_FIELDS
 * in RequestInput.tsx requires: peer_help.subject, borrow.item).
 * Moving requires move_type='furniture' (no dropoff) + helpers_needed pre-filled.
 */

import { test, expect, goToDashboard } from '../helpers/fixtures'
import { mockParseRequest, mockLocationSearch } from '../helpers/auth'
import { cleanupRunData } from '../helpers/db'

const CAMPUS_PLACE = {
  place_name: 'Kyle Field',
  formatted_address: '756 Olsen Blvd, College Station, TX 77843',
  source: 'campus_place' as const,
  needs_details: false,
}

// ─── 2D: Moving ───────────────────────────────────────────────────────────────

test('moving: fill location+time+payment → confirm posts → front card visible', async ({
  driverPage: page,
  runId,
}) => {
  await mockParseRequest(page, {
    category: 'moving',
    title: `[E2E-${runId}] Help me move apartments`,
    origin_city: null,
    destination_city: null,
    is_driver: null,
    available_seats: null,
    scheduled_time: null,
    missing_fields: [],
    summary: 'Help with apartment move this weekend.',
    structured_data: {
      move_type: 'furniture',   // no dropoff needed
      helpers_needed: 2,        // CRITICAL: pre-filled
      access_type: 'stairs',
      has_heavy_items: null,
      truck_needed: null,
      estimated_duration: null,
    },
  })
  await mockLocationSearch(page, [CAMPUS_PLACE])

  try {
    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need help moving out Saturday')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 15_000 })

    // Confirm starts disabled (location + time + payment needed)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Fill pickup location
    const fromPicker = page.locator('[data-testid="location-picker-pickup"]')
    await fromPicker.locator('input').fill('Kyle')
    await fromPicker.locator('[data-testid="location-suggestion"]').first().waitFor({ timeout: 5_000 })
    await fromPicker.locator('[data-testid="location-suggestion"]').first().click()
    await expect(fromPicker.locator('[data-testid="location-chip"]')).toBeVisible()

    // Fill time: date bucket + Flexible
    await page.locator('[data-testid="time-option"]').first().click()
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).waitFor({ timeout: 3_000 })
    await page.locator('[data-testid="time-mode"]').filter({ hasText: /Flexible/ }).click()

    // Still disabled (payment needed)
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Payment options visible; must NOT show meal/social
    const payOpts = page.locator('[data-testid="payment-option"]')
    await expect(payOpts.first()).toBeVisible({ timeout: 5_000 })
    await expect(payOpts.filter({ hasText: /Everyone pays for themselves/i })).not.toBeVisible()
    await expect(payOpts.filter({ hasText: /Split the bill/i })).not.toBeVisible()

    // Select first payment
    await payOpts.first().click()

    // Confirm now enabled
    const confirmBtn = page.locator('[data-testid="confirm-post-btn"]')
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 })
    await confirmBtn.click()

    // Front card appears
    const card = page.locator('[data-testid="request-card"]').first()
    await expect(card).toBeVisible({ timeout: 15_000 })
  } finally {
    await cleanupRunData(runId)
  }
})

// ─── 2E: Peer help ────────────────────────────────────────────────────────────

test('peer help: critical fields pre-filled; payment gate → confirm posts → front card visible', async ({
  driverPage: page,
  runId,
}) => {
  await mockParseRequest(page, {
    category: 'peer_help',
    title: `[E2E-${runId}] Calc tutoring`,
    origin_city: null,
    destination_city: null,
    is_driver: null,
    available_seats: null,
    // scheduled_time: use default (pre-set) — no time gate
    missing_fields: [],
    summary: 'Need calc tutoring tonight.',
    structured_data: {
      subject: 'Calc II',   // CRITICAL_FIELDS requires subject
      help_type: 'homework',
      is_virtual: 'false',
      session_type: 'one_time',
    },
  })

  try {
    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Need help with calc tonight')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 15_000 })

    // Confirm disabled until payment selected
    await expect(page.locator('[data-testid="confirm-post-btn"]')).toBeDisabled()

    // Payment options visible; must NOT show meal/social or ride-specific
    const payOpts = page.locator('[data-testid="payment-option"]')
    await expect(payOpts.first()).toBeVisible({ timeout: 5_000 })
    await expect(payOpts.filter({ hasText: /Everyone pays for themselves/i })).not.toBeVisible()
    await expect(payOpts.filter({ hasText: /Split gas/i })).not.toBeVisible()

    // Select first payment
    await payOpts.first().click()

    const confirmBtn = page.locator('[data-testid="confirm-post-btn"]')
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 })
    await confirmBtn.click()

    const card = page.locator('[data-testid="request-card"]').first()
    await expect(card).toBeVisible({ timeout: 15_000 })
  } finally {
    await cleanupRunData(runId)
  }
})

// ─── 2F: Borrow ───────────────────────────────────────────────────────────────

test('borrow: item pre-filled; no payment gate → confirm immediately enabled → front card visible', async ({
  driverPage: page,
  runId,
}) => {
  await mockParseRequest(page, {
    category: 'borrow',
    title: `[E2E-${runId}] Borrow a graphing calculator`,
    origin_city: null,
    destination_city: null,
    is_driver: null,
    available_seats: null,
    scheduled_time: null,  // time gate exempt for borrow
    missing_fields: [],
    payment_mode_unclear: false,
    summary: 'Need to borrow a graphing calculator for finals week.',
    structured_data: {
      item: 'graphing calculator',  // CRITICAL_FIELDS requires item
      duration: 'finals week',
      return_condition: null,
    },
  })

  try {
    await goToDashboard(page)
    await page.locator('[data-testid="request-textarea"]').fill('Can I borrow a graphing calculator?')
    await page.getByRole('button', { name: /Post request/ }).click()
    await page.locator('[data-testid="confirm-post-btn"]').waitFor({ timeout: 15_000 })

    // Borrow is time-gate-exempt and payment is optional (not required for confirm)
    // Confirm should be immediately enabled without selecting payment
    const confirmBtn = page.locator('[data-testid="confirm-post-btn"]')
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 })

    // No time question shown (borrow is exempt from time gate)
    await expect(page.locator('[data-testid="time-question"]')).not.toBeVisible({ timeout: 3_000 })

    // Post it
    await confirmBtn.click()

    const card = page.locator('[data-testid="request-card"]').first()
    await expect(card).toBeVisible({ timeout: 15_000 })
  } finally {
    await cleanupRunData(runId)
  }
})
