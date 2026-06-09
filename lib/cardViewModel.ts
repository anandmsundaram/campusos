// Shared helpers for normalized marketplace card display.
// Pure functions — no React, no side effects.

import { inferDateFromDeadlineText } from '@/lib/timingNormalizer'

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
  | 'open' | 'pending' | 'countered' | 'accepted'
  | 'declined' | 'not_selected' | 'expired' | 'cancelled' | 'completed'

export interface NextAction { label: string; variant: NextActionVariant }

/** Canonical next-action label and variant for a helper's offer card. */
export function formatNextAction(
  offerStatus: string,
  isEffExpired: boolean,
  reqStatus: string,
  neededWhen?: string | null,
): NextAction {
  if (isEffExpired) {
    const detail = neededWhen ? ` (needed ${neededWhen})` : ''
    return { label: `Expired — needed time passed${detail}`, variant: 'expired' }
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
  open:         'text-blue-400',
  pending:      'text-slate-500',
  countered:    'text-orange-400',
  accepted:     'text-emerald-500',
  declined:     'text-slate-500',
  not_selected: 'text-slate-500',
  expired:      'text-slate-500',
  cancelled:    'text-slate-500',
  completed:    'text-emerald-400',
}

export function nextActionColor(variant: NextActionVariant): string {
  return NEXT_ACTION_COLOR[variant]
}
