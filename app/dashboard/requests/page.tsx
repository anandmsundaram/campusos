'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getRequestActions, getRequestLifecycleState, type OfferSummary, type RequestLifecycleState } from '@/lib/marketplaceLifecycle'

type RequestStatus = 'open' | 'matched' | 'completed' | 'cancelled'

interface HelperProfile {
  name: string | null
  rating: number | null
}

interface OfferOnRequest {
  id: string
  helper_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'countered'
  counter_budget: number | null
  message: string | null
  profiles: HelperProfile | HelperProfile[] | null
}

interface MyRequest {
  id: string
  title: string
  category: string
  urgency: string
  status: RequestStatus
  location: string | null
  budget: number | null
  scheduled_time: string | null
  created_at: string
  request_offers: OfferOnRequest[]
}

interface ReviewTarget {
  requestId: string
  requestTitle: string
  helperId: string
  helperName: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  rides: 'Rides', moving: 'Moving Help', peer_help: 'Peer Help', errands: 'Errands', borrow: 'Borrow',
}
const CATEGORY_ACCENT: Record<string, string> = {
  rides: 'bg-blue-500', moving: 'bg-orange-500', peer_help: 'bg-green-500', errands: 'bg-purple-500', borrow: 'bg-pink-500',
}
const CATEGORY_BADGE: Record<string, string> = {
  rides: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  moving: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  peer_help: 'text-green-400 bg-green-500/10 border-green-500/20',
  errands: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  borrow: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
}
const URGENCY_BADGE: Record<string, string> = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
}
const LIFECYCLE_SECTION_LABEL: Partial<Record<RequestLifecycleState, string>> = {
  open_no_offers: 'Open',
  open_with_offers: 'Open',
  accepted_upcoming: 'Matched',
  accepted_past_due: 'Matched',
  expired_no_offers: 'Expired',
  expired_with_unaccepted_offers: 'Expired',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function getOfferSummary(req: MyRequest): OfferSummary {
  return {
    pendingCount: req.request_offers.filter(o => o.status === 'pending' || o.status === 'countered').length,
    acceptedCount: req.request_offers.filter(o => o.status === 'accepted').length,
    totalCount: req.request_offers.length,
  }
}

function normalizeProfile(p: HelperProfile | HelperProfile[] | null | undefined): HelperProfile | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  target,
  onClose,
  onSubmitted,
}: {
  target: ReviewTarget
  onClose: () => void
  onSubmitted: () => void
}) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0 || submitting) return
    setSubmitting(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Session expired.'); setSubmitting(false); return }

    const { error: insertErr } = await supabase.from('reviews').insert({
      reviewer_id: user.id,
      reviewed_user_id: target.helperId,
      request_id: target.requestId,
      rating,
      review_text: reviewText.trim() || null,
    })

    if (insertErr) {
      setError(insertErr.code === '23505' ? "You've already reviewed this helper." : insertErr.message)
      setSubmitting(false)
      return
    }

    // Recalculate helper's average rating
    const { data: allReviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('reviewed_user_id', target.helperId)

    if (allReviews && allReviews.length > 0) {
      const avg = allReviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / allReviews.length

      // Also get current completed_tasks to increment
      const { data: helperProfile } = await supabase
        .from('profiles')
        .select('completed_tasks')
        .eq('id', target.helperId)
        .single()

      await supabase.from('profiles').update({
        rating: Math.round(avg * 100) / 100,
        completed_tasks: (helperProfile?.completed_tasks ?? 0) + 1,
      }).eq('id', target.helperId)
    }

    setSubmitting(false)
    setDone(true)
    setTimeout(() => { onSubmitted() }, 1500)
  }

  const displayRating = hovered || rating

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#1e2d4a] bg-[#0a0f1e] p-6 shadow-2xl shadow-black/60">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
        >
          ✕
        </button>

        {done ? (
          <div className="py-6 text-center">
            <div className="mb-3 text-4xl">⭐</div>
            <p className="text-sm font-semibold text-white">Review submitted!</p>
            <p className="mt-1 text-xs text-slate-500">Thanks for your feedback.</p>
          </div>
        ) : (
          <>
            <h3 className="pr-8 text-sm font-semibold text-white">Leave a Review</h3>
            <p className="mt-1 pr-8 text-xs text-slate-500 leading-relaxed">
              How was {target.helperName ?? 'your helper'} for &ldquo;{target.requestTitle}&rdquo;?
            </p>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              {/* Star rating */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(0)}
                      className="transition-transform hover:scale-110"
                    >
                      <svg
                        className={`h-8 w-8 transition-colors ${n <= displayRating ? 'text-yellow-400' : 'text-slate-700'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="ml-2 text-sm font-medium text-yellow-400">
                      {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}
                    </span>
                  )}
                </div>
              </div>

              {/* Review text */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Review <span className="ml-1 normal-case tracking-normal font-normal text-slate-600">optional</span>
                </label>
                <textarea
                  rows={3}
                  value={reviewText}
                  onChange={e => setReviewText(e.target.value)}
                  placeholder="Share your experience…"
                  disabled={submitting}
                  className="w-full resize-none rounded-lg border border-[#1e2d4a] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-xs text-red-400">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={rating === 0 || submitting}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit review'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg border border-[#1e2d4a] px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
                >
                  Skip
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('requests')
      .select(`
        id, title, category, urgency, status, location, budget, scheduled_time, created_at,
        request_offers(id, helper_id, status, counter_budget, message, profiles!helper_id(name, rating))
      `)
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })

    setRequests((data as MyRequest[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCancel(requestId: string) {
    setActing(requestId)
    setActionError(null)
    const supabase = createClient()
    const { data: result, error } = await supabase.rpc('cancel_request_safe', {
      p_request_id: requestId,
      p_reason: 'cancelled_by_requester',
    })
    if (error || !result?.ok) { setActionError(error?.message ?? result?.error ?? 'Failed to cancel') } else {
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'cancelled' } : r))
    }
    setActing(null)
  }

  async function handleComplete(req: MyRequest) {
    setActing(req.id)
    setActionError(null)
    const supabase = createClient()
    const { data: result, error } = await supabase.rpc('complete_request_safe', { p_request_id: req.id })
    if (error || !result?.ok) { setActionError(error?.message ?? result?.error ?? 'Failed to complete'); setActing(null); return }

    setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'completed' } : r))

    // Rides: notify all accepted passengers via canonical request_offers
    if (req.category === 'rides') {
      const { data: acceptedOffers } = await supabase
        .from('request_offers')
        .select('helper_id')
        .eq('request_id', req.id)
        .eq('status', 'accepted')

      if (acceptedOffers && acceptedOffers.length > 0) {
        for (const o of acceptedOffers) {
          await supabase.from('notifications').insert({
            user_id: o.helper_id,
            type: 'task_completed',
            message: `Ride "${req.title}" has been completed. Safe travels!`,
            related_request_id: req.id,
          })
        }
      }

      setActing(null)
      return
    }

    // Non-rides: notify the accepted helper and open review modal
    const acceptedOffer = req.request_offers.find(o => o.status === 'accepted')
    const helperProfile = acceptedOffer ? normalizeProfile(acceptedOffer.profiles) : null

    if (acceptedOffer) {
      await supabase.from('notifications').insert({
        user_id: acceptedOffer.helper_id,
        type: 'task_completed',
        message: `Task "${req.title}" was marked complete. Great work!`,
        related_request_id: req.id,
      })

      setReviewTarget({
        requestId: req.id,
        requestTitle: req.title,
        helperId: acceptedOffer.helper_id,
        helperName: helperProfile?.name ?? null,
      })
    }

    setActing(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Spinner /> Loading your requests…
        </div>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-12">
        <PageHeader title="My Requests" sub="Requests you've posted on CampusOS" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1e2d4a] bg-[#0d1526] py-16 px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#1e2d4a] bg-[#0a0f1e] text-2xl">
            📝
          </div>
          <p className="text-sm font-semibold text-slate-300">You haven&apos;t posted a request yet</p>
          <p className="mt-2 max-w-xs text-xs text-slate-500 leading-relaxed">
            Requests are how you ask for help on campus — rides, tutoring, moving, errands, or borrowing items.
            Other verified students respond with offers.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['🚗 Ride', '📦 Moving', '📚 Tutoring', '🛒 Errand', '🔌 Borrow'].map(tag => (
              <span key={tag} className="rounded-full border border-[#1e2d4a] bg-white/[0.02] px-3 py-1 text-xs text-slate-600">
                {tag}
              </span>
            ))}
          </div>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Post your first request
          </Link>
        </div>
      </div>
    )
  }

  // Group by lifecycle state (not raw DB status) so expired-open records don't
  // appear as "Open" with actionable buttons.
  const sectionOrder: Array<{ key: string; label: string; badgeClass: string; items: MyRequest[] }> = []
  const sectionMap = new Map<string, { label: string; badgeClass: string; items: MyRequest[] }>()

  for (const req of requests) {
    const lc = getRequestLifecycleState(req, getOfferSummary(req))
    const sectionLabel = LIFECYCLE_SECTION_LABEL[lc] ?? 'Open'
    const key = sectionLabel
    if (!sectionMap.has(key)) {
      const badgeClass =
        key === 'Open'      ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
        : key === 'Matched' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : key === 'Expired' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : key === 'Completed' ? 'text-slate-400 bg-white/[0.03] border-white/10'
        : 'text-slate-600 bg-white/[0.02] border-[#1e2d4a]'
      sectionMap.set(key, { label: key, badgeClass, items: [] })
      sectionOrder.push({ key, label: key, badgeClass, items: sectionMap.get(key)!.items })
    }
    sectionMap.get(key)!.items.push(req)
  }

  // Canonical section display order
  const SECTION_DISPLAY_ORDER = ['Open', 'Matched', 'Expired', 'Completed', 'Cancelled']
  const grouped = SECTION_DISPLAY_ORDER
    .map(label => sectionOrder.find(s => s.label === label))
    .filter((s): s is NonNullable<typeof s> => !!s && s.items.length > 0)

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-12 space-y-10">
        <PageHeader title="My Requests" sub={`${requests.length} total request${requests.length !== 1 ? 's' : ''}`} />

        {actionError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-400">
            {actionError}
          </div>
        )}

        {grouped.map(({ key, label, badgeClass, items }) => (
          <section key={key}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-semibold text-slate-300">{label}</h2>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                {items.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {items.map(req => {
                const offerSummary = getOfferSummary(req)
                const lcActions = getRequestActions(req, offerSummary) // canCancel, canMarkComplete, state
                const { state: lcState, canCancel, canMarkComplete } = lcActions
                const acceptedOffer = req.request_offers.find(o => o.status === 'accepted')
                const acceptedHelper = acceptedOffer ? normalizeProfile(acceptedOffer.profiles) : null
                const pendingCount = offerSummary.pendingCount
                const isActing = acting === req.id
                const dimmed = req.status === 'cancelled' || req.status === 'completed'
                  || lcState === 'expired_no_offers' || lcState === 'expired_with_unaccepted_offers'

                return (
                  <div
                    key={req.id}
                    className={`relative overflow-hidden rounded-xl border border-[#1e2d4a] bg-[#0d1526] transition-opacity ${dimmed ? 'opacity-60' : ''}`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

                    <div className="pl-5 pr-4 pt-4 pb-4">
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_BADGE[req.category]}`}>
                          {CATEGORY_LABELS[req.category] ?? req.category}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${URGENCY_BADGE[req.urgency]}`}>
                          {req.urgency}
                        </span>
                      </div>

                      <p className="text-[15px] font-semibold text-white leading-snug mb-3">{req.title}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                        {req.location && <span>📍 {req.location}</span>}
                        {req.scheduled_time && (
                          <span>🕐 {new Date(req.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        )}
                        {req.budget != null && <span>💵 ${req.budget}</span>}
                        <span className="text-slate-600">{timeAgo(req.created_at)}</span>
                      </div>

                      {req.status === 'matched' && acceptedHelper && (
                        <div className="mb-3 flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5">
                          <div className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-700/30 text-xs font-semibold text-emerald-300">
                            {acceptedHelper.name ? acceptedHelper.name[0].toUpperCase() : '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-emerald-300">{acceptedHelper.name ?? 'Anonymous'}</span>
                            {acceptedHelper.rating != null && (
                              <span className="ml-2 text-xs text-emerald-600">★ {Number(acceptedHelper.rating).toFixed(1)}</span>
                            )}
                          </div>
                          {acceptedOffer?.counter_budget != null && (
                            <span className="text-xs font-semibold text-yellow-400">${acceptedOffer.counter_budget} agreed</span>
                          )}
                          <span className="text-[10px] font-medium text-emerald-500">Helper matched</span>
                        </div>
                      )}

                      {req.status === 'open' && pendingCount > 0 && (
                        <p className="mb-3 text-xs text-slate-500">
                          {pendingCount} pending offer{pendingCount !== 1 ? 's' : ''}
                        </p>
                      )}

                      <div className="flex items-center gap-2 border-t border-[#1e2d4a] pt-3">
                        {canCancel && (
                          <button
                            data-testid="cancel-request-btn"
                            type="button"
                            onClick={() => handleCancel(req.id)}
                            disabled={isActing}
                            className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-500 transition-all hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                          >
                            {isActing ? '…' : 'Cancel request'}
                          </button>
                        )}
                        {canMarkComplete && (
                          <button
                            data-testid="mark-complete-btn"
                            type="button"
                            onClick={() => handleComplete(req)}
                            disabled={isActing}
                            className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                          >
                            {isActing ? '…' : 'Mark complete'}
                          </button>
                        )}
                        {(lcState === 'expired_no_offers' || lcState === 'expired_with_unaccepted_offers') && (
                          <span data-testid="req-expired-label" className="text-xs text-slate-500">
                            Expired — no helper accepted
                          </span>
                        )}
                        {lcState === 'completed' && (
                          <span className="text-xs text-slate-600">Completed</span>
                        )}
                        {lcState === 'cancelled' && (
                          <span className="text-xs text-slate-600">Cancelled</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Review modal */}
      {reviewTarget && (
        <ReviewModal
          target={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSubmitted={() => setReviewTarget(null)}
        />
      )}
    </>
  )
}

function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-600">{sub}</p>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}
