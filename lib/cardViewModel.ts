// Shared helpers for normalized marketplace card display.
// Pure functions — no React, no side effects.

import { inferDateFromDeadlineText } from '@/lib/timingNormalizer'
import type { OfferLifecycleState, RequestLifecycleState } from '@/lib/marketplaceLifecycle'

export interface CardRequest {
  category: string
  status: string
  location?: string | null
  scheduled_time?: string | null
  created_at: string
  budget?: number | null
  is_driver?: boolean | null
  origin_city?: string | null
  destination_city?: string | null
  structured_data?: Record<string, unknown> | null
  pickup_location?: Record<string, unknown> | null
  dropoff_location?: Record<string, unknown> | null
  flexible_time?: boolean | null
  description?: string | null
}

/** Location string for this request, or null. Uses per-category field priority. */
export function formatWhere(req: CardRequest): string | null {
  const sd = req.structured_data ?? null
  switch (req.category) {
    case 'rides':
      if (req.origin_city && req.destination_city) return `${req.origin_city} → ${req.destination_city}`
      return req.location ?? null
    case 'errands': {
      const loc = (req.pickup_location?.place_name as string | undefined)
        ?? (sd?.store_or_place as string | undefined)
        ?? req.location
      return loc ?? null
    }
    case 'moving': {
      const from = req.pickup_location?.place_name as string | undefined
      const to = req.dropoff_location?.place_name as string | undefined
      if (from && to) return `${from} → ${to}`
      if (from) return `From: ${from}`
      return req.location ?? null
    }
    case 'borrow':
      return (req.pickup_location?.place_name as string | undefined) ?? req.location ?? null
    case 'meal_meetup': {
      const place = (typeof sd?.restaurant_or_area === 'string' ? sd.restaurant_or_area : null)
        ?? (req.pickup_location?.place_name as string | undefined)
        ?? req.location
      return place ?? null
    }
    default:
      return req.location ?? null
  }
}

/** True for categories where a missing location warrants a "Location not provided" fallback. */
export function hasExpectedLocation(category: string): boolean {
  return category === 'errands' || category === 'moving' || category === 'borrow' || category === 'rides'
}

/** Human-readable needed-time string. Resolves scheduled_time or infers from deadline_text for old records. */
export function formatWhen(req: CardRequest): string | null {
  if (req.scheduled_time) {
    const d = new Date(req.scheduled_time)
    if (req.flexible_time) {
      return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + ' · Flexible'
    }
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }
  const dt = req.structured_data?.deadline_text
  if (typeof dt === 'string' && dt) {
    // For old records with vague labels like "Today, flexible time", infer the absolute date
    const inferred = inferDateFromDeadlineText(dt, req.created_at)
    if (inferred) {
      const dateStr = inferred.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const isFlexible = dt.toLowerCase().includes('flexible')
      return isFlexible ? `${dateStr} · Flexible` : dateStr
    }
    return dt
  }
  return null
}

/** Absolute posted date (not a relative "X days ago"). */
export function formatPostedTime(created_at: string): string {
  const d = new Date(created_at)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Short description or AI-generated summary, or null if neither exists. */
export function formatNote(req: CardRequest): string | null {
  if (req.description) return req.description
  const sd = req.structured_data ?? null
  if (typeof sd?.summary === 'string' && sd.summary) return sd.summary
  return null
}

export type NextActionVariant =
  | 'open' | 'pending' | 'countered' | 'accepted' | 'accepted_past_due'
  | 'declined' | 'not_selected' | 'expired' | 'cancelled' | 'completed'

export interface NextAction { label: string; variant: NextActionVariant }

/**
 * Canonical next-action label and variant for a helper's offer card.
 * @param offerStatus  - current offer row status
 * @param isEffExpired - true when a PENDING/COUNTERED offer's request expired (no accepted offer)
 * @param reqStatus    - parent request status
 * @param neededWhen   - human-readable needed date/time for richer expiry labels
 * @param isPastDue    - true when an ACCEPTED offer's request is past its needed time but not completed
 */
export function formatNextAction(
  offerStatus: string,
  isEffExpired: boolean,
  reqStatus: string,
  neededWhen?: string | null,
  isPastDue?: boolean,
): NextAction {
  // Accepted offer whose needed time has passed but work not confirmed
  if (isPastDue) {
    const detail = neededWhen ? ` (needed ${neededWhen})` : ''
    return { label: `Past due — accepted helper, waiting for completion confirmation${detail}`, variant: 'accepted_past_due' }
  }
  // Pending/countered offer on a request whose needed time passed with no accepted helper
  if (isEffExpired) {
    const detail = neededWhen ? ` before ${neededWhen}` : ''
    return { label: `Expired — no accepted helper${detail}`, variant: 'expired' }
  }
  if (reqStatus === 'cancelled') return { label: 'Request cancelled', variant: 'cancelled' }
  if (reqStatus === 'completed') return { label: 'Completed', variant: 'completed' }
  if (offerStatus === 'pending') return { label: 'Waiting for requester to respond', variant: 'pending' }
  if (offerStatus === 'countered') return { label: 'Counter received — tap to respond', variant: 'countered' }
  if (offerStatus === 'accepted') return { label: 'Accepted — coordinate via Messages', variant: 'accepted' }
  if (offerStatus === 'rejected') {
    if (reqStatus === 'matched') return { label: 'Requester chose another helper', variant: 'not_selected' }
    return { label: 'Declined', variant: 'declined' }
  }
  return { label: 'Open — you can offer', variant: 'open' }
}

const NEXT_ACTION_COLOR: Record<NextActionVariant, string> = {
  open:             'text-blue-400',
  pending:          'text-slate-500',
  countered:        'text-orange-400',
  accepted:         'text-emerald-500',
  accepted_past_due:'text-amber-500',
  declined:         'text-slate-500',
  not_selected:     'text-slate-500',
  expired:          'text-slate-500',
  cancelled:        'text-slate-500',
  completed:        'text-emerald-400',
}

export function nextActionColor(variant: NextActionVariant): string {
  return NEXT_ACTION_COLOR[variant]
}

export interface RequestStatusBadge { label: string; cls: string }

/** Primary lifecycle status badge for a requester-owned request card. */
export function formatRequestStatusBadge(state: RequestLifecycleState): RequestStatusBadge {
  switch (state) {
    case 'open_no_offers':
      return { label: 'Open', cls: 'text-slate-600 bg-slate-100 border-slate-200' }
    case 'open_with_offers':
      return { label: 'Offers pending', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    case 'accepted_upcoming':
      return { label: 'Accepted', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    case 'accepted_past_due':
      return { label: 'Past due', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    case 'completed':
      return { label: 'Completed', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    case 'expired_no_offers':
    case 'expired_with_unaccepted_offers':
      return { label: 'Expired', cls: 'text-slate-500 bg-slate-50 border-slate-200' }
    case 'cancelled':
      return { label: 'Cancelled', cls: 'text-slate-500 bg-slate-50 border-slate-200' }
  }
}

/**
 * Canonical next-action display derived from a structured OfferLifecycleState.
 * Prefer this over the legacy formatNextAction() for new call sites.
 */
export function formatNextActionFromState(
  state: OfferLifecycleState,
  neededWhen?: string | null,
): NextAction {
  const w = neededWhen ? ` before ${neededWhen}` : ''
  const n = neededWhen ? ` (needed ${neededWhen})` : ''
  switch (state) {
    case 'pending_open':     return { label: 'Waiting for requester to respond', variant: 'pending' }
    case 'pending_expired':  return { label: `Expired — no accepted helper${w}`, variant: 'expired' }
    case 'accepted_upcoming': return { label: 'Accepted — coordinate via Messages', variant: 'accepted' }
    case 'accepted_past_due': return { label: `Past due — accepted helper, waiting for completion confirmation${n}`, variant: 'accepted_past_due' }
    case 'completed':        return { label: 'Completed', variant: 'completed' }
    case 'declined':         return { label: 'Declined', variant: 'declined' }
    case 'not_selected':     return { label: 'Requester chose another helper', variant: 'not_selected' }
    case 'cancelled':        return { label: 'Request cancelled', variant: 'cancelled' }
  }
}
