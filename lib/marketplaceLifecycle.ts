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
 * Returns true when a pending or countered offer's parent request has expired.
 * Accepted and rejected offers are already final — expiry doesn't change them.
 */
export function isOfferEffectivelyExpired(
  offerStatus: string,
  req: RequestExpirability,
): boolean {
  if (offerStatus !== 'pending' && offerStatus !== 'countered') return false
  return isRequestExpired(req)
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
