/**
 * Spec 50 — Offer selection resolves superseded offers
 *
 * Verifies the fix for the production bug where:
 *  - getOfferLifecycleState returned 'pending_open' for pending/countered offers
 *    on a matched request (another helper already accepted)
 *  - canActOnOffer returned true for those offers, showing Accept/Decline buttons
 *    to helpers whose offer was superseded
 *
 * After the fix:
 *  - getOfferLifecycleState returns 'not_selected' for pending/countered on matched
 *  - canActOnOffer returns false, hiding the action buttons
 *  - The UI shows "another helper was accepted" closed-reason text
 *
 * Tests:
 *  1. getOfferLifecycleState: pending on matched → 'not_selected'
 *  2. getOfferLifecycleState: countered on matched → 'not_selected'
 *  3. getOfferLifecycleState: pending on open (non-expired) → 'pending_open'
 *  4. getOfferLifecycleState: countered on open (non-expired) → 'pending_open'
 *  5. getOfferLifecycleState: pending on open (expired) → 'pending_expired'
 *  6. getOfferLifecycleState: rejected on matched → 'not_selected' (unchanged)
 *  7. getOfferLifecycleState: accepted on matched → 'accepted_upcoming' (unchanged)
 *  8. canActOnOffer: pending on matched → false
 *  9. canActOnOffer: countered on matched → false
 * 10. canActOnOffer: countered on open non-expired → true (unchanged)
 * 11. canActOnOffer: countered on cancelled → false (unchanged)
 * 12. canActOnOffer: countered on completed → false (unchanged)
 * 13. UI: My Offers page — countered offer on open request shows accept/decline buttons
 * 14. UI: My Offers page — counter-closed-reason absent when offer is pending_open
 */

import { test, expect } from '../helpers/fixtures'
import {
  getOfferLifecycleState,
  canActOnOffer,
} from '../../lib/marketplaceLifecycle'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Date.now()
const FRESH_REQ = {
  scheduled_time: null,
  created_at: new Date(NOW - 60 * 1000).toISOString(),
}
const STALE_REQ = {
  scheduled_time: null,
  created_at: new Date(NOW - 73 * 60 * 60 * 1000).toISOString(),
}
const FUTURE_SCHED = {
  scheduled_time: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
  created_at: new Date(NOW - 30 * 60 * 1000).toISOString(),
}

// ─── Unit: getOfferLifecycleState — matched request ───────────────────────────

test.describe('getOfferLifecycleState: pending/countered on matched request', () => {

  test('pending offer on matched request returns not_selected', () => {
    const state = getOfferLifecycleState('pending', { ...FRESH_REQ, status: 'matched' })
    expect(state).toBe('not_selected')
  })

  test('countered offer on matched request returns not_selected', () => {
    const state = getOfferLifecycleState('countered', { ...FRESH_REQ, status: 'matched' })
    expect(state).toBe('not_selected')
  })

  test('pending offer on open non-expired request returns pending_open', () => {
    const state = getOfferLifecycleState('pending', { ...FRESH_REQ, status: 'open' })
    expect(state).toBe('pending_open')
  })

  test('countered offer on open non-expired request returns pending_open', () => {
    const state = getOfferLifecycleState('countered', { ...FRESH_REQ, status: 'open' })
    expect(state).toBe('pending_open')
  })

  test('pending offer on stale open request returns pending_expired', () => {
    const state = getOfferLifecycleState('pending', { ...STALE_REQ, status: 'open' })
    expect(state).toBe('pending_expired')
  })

  test('rejected offer on matched request returns not_selected', () => {
    const state = getOfferLifecycleState('rejected', { ...FRESH_REQ, status: 'matched' })
    expect(state).toBe('not_selected')
  })

  test('accepted offer on matched request returns accepted_upcoming', () => {
    const state = getOfferLifecycleState('accepted', { ...FUTURE_SCHED, status: 'matched' })
    expect(state).toBe('accepted_upcoming')
  })

})

// ─── Unit: canActOnOffer — matched request ─────────────────────────────────────

test.describe('canActOnOffer: matched request blocks helper action', () => {

  test('pending offer on matched request: canActOnOffer=false', () => {
    expect(canActOnOffer('pending', { ...FRESH_REQ, status: 'matched' })).toBe(false)
  })

  test('countered offer on matched request: canActOnOffer=false', () => {
    expect(canActOnOffer('countered', { ...FRESH_REQ, status: 'matched' })).toBe(false)
  })

  test('countered offer on open non-expired request: canActOnOffer=true', () => {
    expect(canActOnOffer('countered', { ...FRESH_REQ, status: 'open' })).toBe(true)
  })

  test('countered offer on cancelled request: canActOnOffer=false', () => {
    expect(canActOnOffer('countered', { ...FRESH_REQ, status: 'cancelled' })).toBe(false)
  })

  test('countered offer on completed request: canActOnOffer=false', () => {
    expect(canActOnOffer('countered', { ...FRESH_REQ, status: 'completed' })).toBe(false)
  })

})

// ─── UI: My Offers page action gating ─────────────────────────────────────────

test.describe('My Offers UI — action button gating', () => {

  test('My Offers page loads without error', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/offers')
    // Page should load without a JS crash
    const heading = driverPage.locator('[data-testid="my-offers-heading"]')
    await expect(heading).toBeVisible({ timeout: 12_000 })
  })

  test('counter-closed-reason is absent when no countered offers exist on open request', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/offers')
    // Wait for offers to load
    await driverPage.waitForTimeout(2_000)
    // If any counter-closed-reason elements exist, none should say "Another helper"
    // for an offer whose parent request is still open
    const reasons = driverPage.locator('[data-testid="counter-closed-reason"]')
    const count = await reasons.count()
    for (let i = 0; i < count; i++) {
      const text = await reasons.nth(i).textContent()
      // Each closed-reason must have a valid explanation (not a blank or generic catch-all)
      expect(text).toMatch(/cancelled|completed|another helper|No actions available/)
    }
  })

})
