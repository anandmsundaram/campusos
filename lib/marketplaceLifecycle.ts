// Named constants — single source of truth for all lifecycle rules.
export const STALE_REQUEST_WINDOW_MS = 72 * 60 * 60 * 1000 // 72 hours
export const MAX_OFFER_AMOUNT = 500

export interface RequestExpirability {
  scheduled_time: string | null
  created_at: string
}

/**
 * Returns true when a request should no longer appear as active inventory.
 * - Has scheduled_time: expires once that time passes (no grace period)
 * - No scheduled_time: stale after STALE_REQUEST_WINDOW_MS (72 h)
 */
export function isRequestExpired(req: RequestExpirability): boolean {
  const now = Date.now()
  if (req.scheduled_time) {
    return new Date(req.scheduled_time).getTime() < now
  }
  return now - new Date(req.created_at).getTime() > STALE_REQUEST_WINDOW_MS
}

/**
 * Returns true when a pending or countered offer's parent request has expired
 * with NO accepted offer. Accepted and rejected offers are already final —
 * this function must NOT apply to them.
 */
export function isOfferEffectivelyExpired(
  offerStatus: string,
  req: RequestExpirability,
): boolean {
  if (offerStatus !== 'pending' && offerStatus !== 'countered') return false
  return isRequestExpired(req)
}

/**
 * Returns true when an accepted offer's parent request has passed its needed
 * time but the request has NOT been marked completed or cancelled.
 * This is "accepted past-due" — distinct from expiry, which only applies
 * when no offer was ever accepted.
 */
export function isAcceptedPastDue(
  offerStatus: string,
  req: RequestExpirability,
  reqStatus: string,
): boolean {
  if (offerStatus !== 'accepted') return false
  if (reqStatus === 'completed' || reqStatus === 'cancelled') return false
  return isRequestExpired(req)
}

// ─── Structured lifecycle state model ─────────────────────────────────────────

/**
 * All possible lifecycle states for a request (requester-facing).
 * These are mutually exclusive and exhaustive.
 */
export type RequestLifecycleState =
  | 'open_no_offers'              // open, needed time not passed, no offers
  | 'open_with_offers'            // open, needed time not passed, ≥1 pending/countered offer
  | 'accepted_upcoming'           // offer accepted, needed time not yet passed
  | 'accepted_past_due'           // offer accepted, needed time passed, not completed
  | 'expired_no_offers'           // needed time passed, no offers were ever made
  | 'expired_with_unaccepted_offers' // needed time passed, offers existed but none accepted
  | 'completed'                   // request explicitly marked completed
  | 'cancelled'                   // request explicitly cancelled

/** Summary of offers on a request — needed to determine lifecycle state. */
export interface OfferSummary {
  pendingCount: number   // offers in pending or countered state
  acceptedCount: number  // offers in accepted state
  totalCount: number     // all offers regardless of status
}

/**
 * Derives the factual lifecycle state of a request from its DB fields and
 * its aggregated offer counts. This is the single source of truth for all
 * request lifecycle decisions across every marketplace surface.
 */
export function getRequestLifecycleState(
  req: RequestExpirability & { status: string },
  offers: OfferSummary,
): RequestLifecycleState {
  // Terminal states take absolute precedence
  if (req.status === 'completed') return 'completed'
  if (req.status === 'cancelled') return 'cancelled'

  const expired = isRequestExpired(req)
  // Treat 'matched' as having an accepted offer even if offer summary lags
  const hasAccepted = offers.acceptedCount > 0 || req.status === 'matched'

  if (expired) {
    if (hasAccepted) return 'accepted_past_due'
    return offers.totalCount > 0 ? 'expired_with_unaccepted_offers' : 'expired_no_offers'
  }

  if (hasAccepted) return 'accepted_upcoming'
  return offers.pendingCount > 0 ? 'open_with_offers' : 'open_no_offers'
}

/**
 * All possible lifecycle states for a helper's offer (helper-facing).
 */
export type OfferLifecycleState =
  | 'pending_open'     // pending/countered on an open, non-expired request
  | 'pending_expired'  // pending/countered on a request whose needed time passed with no accepted helper
  | 'accepted_upcoming' // accepted, needed time not yet passed
  | 'accepted_past_due' // accepted, needed time passed, not yet completed
  | 'completed'        // request was completed
  | 'declined'         // offer was rejected by requester (no other was accepted)
  | 'not_selected'     // offer rejected because another helper was accepted
  | 'cancelled'        // request was cancelled

/**
 * Derives the factual lifecycle state of a helper's offer from the offer's
 * status and the parent request's status + expiry. This is the single source
 * of truth for all helper-facing offer status decisions.
 */
export function getOfferLifecycleState(
  offerStatus: string,
  req: RequestExpirability & { status: string },
): OfferLifecycleState {
  if (req.status === 'completed') return 'completed'
  if (req.status === 'cancelled') return 'cancelled'

  if (offerStatus === 'accepted') {
    if (isAcceptedPastDue(offerStatus, req, req.status)) return 'accepted_past_due'
    return 'accepted_upcoming'
  }

  if (offerStatus === 'rejected') {
    // If request is matched, another offer was accepted → not_selected
    if (req.status === 'matched') return 'not_selected'
    return 'declined'
  }

  // pending or countered
  if (isRequestExpired(req)) return 'pending_expired'
  return 'pending_open'
}

/**
 * Returns the section bucket a request should appear in, based on lifecycle state.
 * - actionable: requester needs to act (review offers, confirm completion)
 * - current: active, no immediate action needed
 * - past: time has passed but still relevant to the user
 * - closed: terminal state
 */
export function getRequestSectionBucket(
  state: RequestLifecycleState,
): 'actionable' | 'current' | 'past' | 'closed' {
  switch (state) {
    case 'open_with_offers':
    case 'accepted_past_due':
      return 'actionable'
    case 'open_no_offers':
    case 'accepted_upcoming':
      return 'current'
    case 'expired_no_offers':
    case 'expired_with_unaccepted_offers':
      return 'past'
    case 'completed':
    case 'cancelled':
      return 'closed'
  }
}

/**
 * Returns a factual, human-readable lifecycle reason string for display.
 * neededWhen is the formatted needed date/time string (e.g. "Jun 9 at 9 AM").
 */
export function getLifecycleReason(
  state: RequestLifecycleState | OfferLifecycleState,
  neededWhen?: string | null,
): string {
  const w = neededWhen ? ` before ${neededWhen}` : ''
  const n = neededWhen ? ` (needed ${neededWhen})` : ''
  switch (state) {
    case 'open_no_offers':          return 'Open — waiting for offers'
    case 'open_with_offers':        return 'Open — review pending offers'
    case 'accepted_upcoming':       return 'Accepted — coordinate via Messages'
    case 'accepted_past_due':       return `Past due — accepted helper, completion not confirmed${n}`
    case 'expired_no_offers':       return `Expired — no offers before needed time${w}`
    case 'expired_with_unaccepted_offers': return `Expired — offers existed but no helper was accepted${w}`
    case 'completed':               return 'Completed'
    case 'cancelled':               return 'Request cancelled'
    case 'pending_open':            return 'Waiting for requester to respond'
    case 'pending_expired':         return `Expired — no accepted helper${w}`
    case 'declined':                return 'Declined'
    case 'not_selected':            return 'Requester chose another helper'
  }
}

/** Returns a smart "View offers" button label for the requester view on My Requests. */
export function getRequesterViewOffersLabel(
  state: RequestLifecycleState,
  pendingOfferCount: number,
): string {
  switch (state) {
    case 'open_with_offers':        return `Review ${pendingOfferCount} offer${pendingOfferCount !== 1 ? 's' : ''}`
    case 'accepted_upcoming':
    case 'accepted_past_due':       return 'View accepted helper'
    case 'expired_with_unaccepted_offers': return 'View expired offers'
    default:                        return 'View offers'
  }
}

/**
 * Validates a raw user-typed offer or counter amount string.
 * Returns a human-readable error, or null if the value is acceptable.
 * Empty string is valid (means "accept the request's posted budget").
 */
export function validateOfferAmount(raw: string): string | null {
  if (raw === '' || raw.trim() === '') return null
  const n = parseFloat(raw)
  if (!isFinite(n) || isNaN(n)) return 'Enter a valid dollar amount'
  if (n < 0) return 'Amount cannot be negative'
  if (n > MAX_OFFER_AMOUNT) return `Maximum offer amount is $${MAX_OFFER_AMOUNT} during beta`
  return null
}
