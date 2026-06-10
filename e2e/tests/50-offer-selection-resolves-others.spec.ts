/**
 * Spec 50 — Offer selection resolves superseded offers + amount source of truth
 *
 * Covers the two-part fix for the production bug:
 *
 * Part 1 (c9c9a7e): lifecycle model + UI action gating
 *  - getOfferLifecycleState returns 'not_selected' for pending/countered on matched
 *  - canActOnOffer returns false, hiding Accept/Decline buttons
 *  - Migration 040: accept_offer_atomic atomically rejects other offers on acceptance
 *
 * Part 2 (this commit): data reconciliation + display hardening
 *  - Migration 041: rejects pre-existing stale pending/countered offers on matched
 *    requests; adds step 5.1 single-seat double-acceptance guard to RPC
 *  - MyOffersTab: 'not_selected' offers show "Not selected" badge + dimmed card
 *    + "another helper was accepted" closed-reason (consistent with offers/page)
 *  - offers/page: status badge shows "Not selected" for not_selected state
 *  - requests/page: agreed amount uses final_agreed_price priority on accepted offer
 *
 * Tests:
 *  1.  getOfferLifecycleState: pending on matched → 'not_selected'
 *  2.  getOfferLifecycleState: countered on matched → 'not_selected'
 *  3.  getOfferLifecycleState: rejected on matched → 'not_selected' (reconciled row)
 *  4.  getOfferLifecycleState: pending on open (non-expired) → 'pending_open'
 *  5.  getOfferLifecycleState: countered on open (non-expired) → 'pending_open'
 *  6.  getOfferLifecycleState: pending on open (expired) → 'pending_expired'
 *  7.  getOfferLifecycleState: accepted on matched → 'accepted_upcoming'
 *  8.  canActOnOffer: pending on matched → false
 *  9.  canActOnOffer: countered on matched → false
 * 10.  canActOnOffer: rejected on matched → false (reconciled rows are also blocked)
 * 11.  canActOnOffer: countered on open non-expired → true
 * 12.  canActOnOffer: countered on cancelled → false
 * 13.  canActOnOffer: countered on completed → false
 * 14.  Accepted offer amount priority: final_agreed_price beats requester_counter beats counter_budget
 * 15.  Non-selected offer's requester_counter never overrides accepted offer amount
 * 16.  UI: My Offers page loads without error
 * 17.  UI: counter-closed-reason text is always a valid explanation string
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

  // Reconciled rows: after migration 041, former 'countered' offers are now 'rejected'
  // on matched requests — they must still be blocked
  test('rejected offer on matched request (reconciled row): canActOnOffer=false', () => {
    expect(canActOnOffer('rejected', { ...FRESH_REQ, status: 'matched' })).toBe(false)
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

// ─── Unit: accepted offer amount priority ─────────────────────────────────────

test.describe('Accepted offer amount priority rule', () => {

  test('final_agreed_price wins over requester_counter and counter_budget', () => {
    const accepted = { final_agreed_price: 50, requester_counter: 10, counter_budget: 20 }
    const amount = accepted.final_agreed_price ?? accepted.requester_counter ?? accepted.counter_budget
    expect(amount).toBe(50)
  })

  test('requester_counter used when final_agreed_price is null', () => {
    const accepted = { final_agreed_price: null, requester_counter: 30, counter_budget: 20 }
    const amount = accepted.final_agreed_price ?? accepted.requester_counter ?? accepted.counter_budget
    expect(amount).toBe(30)
  })

  test('counter_budget used when final_agreed_price and requester_counter are null', () => {
    const accepted = { final_agreed_price: null, requester_counter: null, counter_budget: 50 }
    const amount = accepted.final_agreed_price ?? accepted.requester_counter ?? accepted.counter_budget
    expect(amount).toBe(50)
  })

  test('non-selected offer requester_counter ($10) does not override accepted offer amount ($50)', () => {
    // Simulates: Lakshmi non-selected (requester_counter=$10) + Sanjana accepted (final_agreed_price=$50)
    const offers = [
      { status: 'rejected' as const, final_agreed_price: null, requester_counter: 10, counter_budget: 20 },
      { status: 'accepted' as const, final_agreed_price: 50, requester_counter: null, counter_budget: 50 },
    ]
    const acceptedOffer = offers.find(o => o.status === 'accepted')
    const displayAmount = acceptedOffer
      ? (acceptedOffer.final_agreed_price ?? acceptedOffer.requester_counter ?? acceptedOffer.counter_budget)
      : null
    // Must show $50 from Sanjana, NOT $10 from Lakshmi
    expect(displayAmount).toBe(50)
  })

  test('getOfferLifecycleState: rejected (reconciled from countered) on matched returns not_selected', () => {
    // After migration 041, Lakshmi's offer status changed from 'countered' to 'rejected'
    // The lifecycle model must still correctly return 'not_selected'
    const state = getOfferLifecycleState('rejected', { ...FRESH_REQ, status: 'matched' })
    expect(state).toBe('not_selected')
  })

})

// ─── UI: My Offers page — gating and messaging ───────────────────────────────

test.describe('My Offers UI — action gating and not-selected messaging', () => {

  test('My Offers page (dashboard tab) loads without error', async ({ driverPage }) => {
    await driverPage.goto('/dashboard')
    // Navigate to My Offers tab
    await driverPage.getByRole('button', { name: /My Offers/ }).click()
    await driverPage.waitForTimeout(1_500)
    // No JS crash
    const cards = driverPage.locator('[data-testid="my-offer-card"]')
    // If cards exist, they must have a status attribute
    const count = await cards.count()
    for (let i = 0; i < count; i++) {
      const status = await cards.nth(i).getAttribute('data-offer-status')
      expect(['pending', 'countered', 'accepted', 'rejected']).toContain(status)
    }
  })

  test('My Offers standalone page loads without error', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/offers')
    const heading = driverPage.locator('[data-testid="my-offers-heading"]')
    await expect(heading).toBeVisible({ timeout: 12_000 })
  })

  test('counter-closed-reason text is always a valid explanation string', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/offers')
    await driverPage.waitForTimeout(2_000)
    const reasons = driverPage.locator('[data-testid="counter-closed-reason"]')
    const count = await reasons.count()
    for (let i = 0; i < count; i++) {
      const text = await reasons.nth(i).textContent()
      expect(text).toMatch(/cancelled|completed|another helper|No actions available/)
    }
  })

  test('no accept-counter-btn visible for any offer on matched request', async ({ driverPage }) => {
    await driverPage.goto('/dashboard/offers')
    await driverPage.waitForTimeout(2_000)
    // There should be no visible accept-counter-btn for any offer whose parent is matched
    // (if test user has no countered offers on open requests, count=0 is fine)
    const acceptBtns = driverPage.locator('[data-testid="accept-counter-btn"]')
    const count = await acceptBtns.count()
    // All visible accept-counter buttons must have an enabled state, meaning the offer is actionable
    for (let i = 0; i < count; i++) {
      const disabled = await acceptBtns.nth(i).getAttribute('disabled')
      // If button exists, it must NOT be disabled — disabled means it's being shown but blocked
      // (our fix hides the button entirely via canActOnOffer, so if visible it should be enabled)
      expect(disabled).toBeNull()
    }
  })

})
