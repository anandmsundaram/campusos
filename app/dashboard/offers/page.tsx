'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { subflowFromCategory, getCounterLabel, getStatusLabel, getOfferNotificationMessage } from '@/lib/offerText'
import { getOfferLifecycleState, canActOnOffer } from '@/lib/marketplaceLifecycle'
import { formatWhere, formatWhen, formatNote, formatNextActionFromState, formatPostedTime, hasExpectedLocation, nextActionColor } from '@/lib/cardViewModel'
import BlockModal from '@/app/components/BlockModal'
import { getMyBlocks } from '@/lib/blocking'

interface RequesterProfile {
  name: string | null
  rating: number | null
}

interface RequestInfo {
  id: string
  title: string
  category: string
  urgency: string
  status: string
  budget: number | null
  location: string | null
  origin_city: string | null
  destination_city: string | null
  scheduled_time: string | null
  created_at: string
  requester_id: string
  is_driver: boolean | null
  structured_data: Record<string, unknown> | null
  flexible_time: boolean | null
  description: string | null
  pickup_location: Record<string, unknown> | null
  dropoff_location: Record<string, unknown> | null
  profiles: RequesterProfile | RequesterProfile[] | null
}

interface MyOffer {
  id: string
  message: string | null
  counter_budget: number | null
  requester_counter: number | null
  final_agreed_price: number | null
  seats_requested: number | null
  status: 'pending' | 'accepted' | 'rejected' | 'countered'
  created_at: string
  requests: RequestInfo | RequestInfo[] | null
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
const OFFER_STATUS: Record<string, { label: string; cls: string }> = {
  pending:           { label: '● Pending',      cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  accepted:          { label: '✓ Accepted',     cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  accepted_past_due: { label: '⏱ Past due',     cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  rejected:          { label: 'Declined',       cls: 'text-slate-500 bg-white/[0.03] border-white/10' },
  countered:         { label: '↔ Countered',    cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  expired:           { label: 'Expired',        cls: 'text-slate-500 bg-white/[0.03] border-white/10' },
}

function normalizeRequest(r: RequestInfo | RequestInfo[] | null | undefined): RequestInfo | null {
  if (!r) return null
  return Array.isArray(r) ? (r[0] ?? null) : r
}

function normalizeProfile(p: RequesterProfile | RequesterProfile[] | null | undefined): RequesterProfile | null {
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

export default function MyOffersPage() {
  const router = useRouter()
  const [offers, setOffers] = useState<MyOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [actError, setActError] = useState<string | null>(null)
  const [blockTarget, setBlockTarget] = useState<{ userId: string; name?: string } | null>(null)
  const [blockedRequesterIds, setBlockedRequesterIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: offersData } = await supabase
      .from('request_offers')
      .select(`
        id, message, counter_budget, requester_counter, final_agreed_price, seats_requested, status, created_at,
        requests(id, title, category, urgency, status, budget, location, origin_city, destination_city, scheduled_time, created_at, requester_id, is_driver, structured_data, flexible_time, description, pickup_location, dropoff_location, profiles!requester_id(name, rating))
      `)
      .eq('helper_id', user.id)
      .order('created_at', { ascending: false })

    setOffers((offersData as MyOffer[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const supabase = createClient()
    getMyBlocks(supabase).then(blocks => {
      setBlockedRequesterIds(new Set(blocks.map(b => b.blocked_id)))
    }).catch(() => {})
  }, [])

  async function handleAcceptCounter(offerId: string, requestId: string, requesterId: string, category: string, errandType: string | null) {
    setActing(offerId)
    setActError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setActError('Not authenticated'); setActing(null); return }
    const { data: result, error } = await supabase.rpc('accept_offer_atomic', {
      p_offer_id: offerId,
      p_accepted_by: user.id,
    })
    if (error || !result?.ok) {
      setActError(error?.message ?? result?.error ?? 'Failed to accept counter-offer')
      setActing(null)
      return
    }
    const subflow = subflowFromCategory(category, errandType)
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'offer_accepted',
      message: getOfferNotificationMessage('counter_accepted', subflow),
      related_request_id: requestId,
    })
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: requesterId,
      request_id: requestId,
      content: '✓ Counter accepted! Chat here to coordinate.',
    })
    setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'accepted' as const } : o))
    setActing(null)
    router.refresh()
  }

  async function handleDeclineCounter(offerId: string, requestId: string, requesterId: string, category: string, errandType: string | null) {
    setActing(offerId)
    setActError(null)
    const supabase = createClient()
    const { data: check } = await supabase.rpc('validate_offer_action', { p_request_id: requestId })
    if (!check?.ok) { setActError(check?.error ?? 'This request is no longer active'); setActing(null); return }
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offerId)
    if (error) { setActError(error.message); setActing(null); return }
    const subflow = subflowFromCategory(category, errandType)
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'offer_rejected',
      message: getOfferNotificationMessage('counter_declined', subflow),
      related_request_id: requestId,
    })
    setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'rejected' as const } : o))
    setActing(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Spinner /> Loading your offers…
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900" data-testid="my-offers-heading">My Offers</h1>
        <p className="mt-1 text-sm text-slate-600">
          {offers.length > 0
            ? `${offers.length} offer${offers.length !== 1 ? 's' : ''} sent`
            : "Requests you've offered to help with"}
        </p>
      </div>

      {offers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1e2d4a] bg-[#0d1526] py-16 px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#1e2d4a] bg-[#0a0f1e] text-2xl">
            🤝
          </div>
          <p className="text-sm font-semibold text-slate-300">You haven&apos;t offered help yet</p>
          <p className="mt-2 max-w-xs text-xs text-slate-500 leading-relaxed">
            Browse open requests from students on your campus. Offer to give a ride, help move, tutor, run an errand, or lend something.
            Accepted offers show up here.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Browse open requests
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {actError && <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-xs text-red-400">{actError}</p>}
          {offers.map(offer => {
            const req = normalizeRequest(offer.requests)
            if (!req) return null
            const profile = normalizeProfile(req.profiles)
            const offerState = getOfferLifecycleState(offer.status, req)
            const isEffExpired = offerState === 'pending_expired'
            const isPastDue = offerState === 'accepted_past_due'
            const displayStatus = isEffExpired ? 'expired' : isPastDue ? 'accepted_past_due' : offer.status
            const statusInfo = OFFER_STATUS[displayStatus] ?? OFFER_STATUS.pending
            const isRejected = offer.status === 'rejected'
            const isCountered = offer.status === 'countered'
            const isActing = acting === offer.id
            const errandType = (req.structured_data?.errand_type as string | null) ?? null
            const isRide = req.category === 'rides'
            const pageSubflow = subflowFromCategory(req.category, req.structured_data?.errand_type as string | null)
            const agreedPrice = offer.final_agreed_price ?? offer.requester_counter ?? offer.counter_budget
            const seats = offer.seats_requested ?? 1
            const statusLabelText = isEffExpired ? 'Expired' : isPastDue ? '⏱ Past due' : getStatusLabel(offer.status, pageSubflow, { agreedPrice, seats })
            const neededWhen = formatWhen(req)
            const nextAction = formatNextActionFromState(offerState, neededWhen)

            return (
              <div
                key={offer.id}
                data-testid="my-offer-card"
                data-offer-id={offer.id}
                data-offer-status={offer.status}
                className={`relative overflow-hidden rounded-xl border bg-[#0d1526] transition-all ${
                  isEffExpired ? 'border-[#1e2d4a] opacity-50'
                  : offer.status === 'accepted' ? 'border-emerald-500/20'
                  : isCountered ? 'border-orange-500/20'
                  : isRejected ? 'border-[#1e2d4a] opacity-60'
                  : 'border-[#1e2d4a]'
                }`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

                <div className="pl-5 pr-4 pt-4 pb-4">
                  {/* Top row: badges + status */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_BADGE[req.category] ?? 'text-slate-400 bg-white/[0.03] border-white/10'}`}>
                      {CATEGORY_LABELS[req.category] ?? req.category}
                    </span>
                    {!isRide && (
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${URGENCY_BADGE[req.urgency]}`}>
                        {req.urgency}
                      </span>
                    )}
                    <span
                      data-testid="my-offer-status-badge"
                      className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusInfo.cls}`}
                    >
                      {statusLabelText}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-[15px] font-semibold text-white leading-snug mb-2">{req.title}</p>

                  {/* Note / description */}
                  {(() => {
                    const note = formatNote(req)
                    return note ? (
                      <p className="text-[11px] text-slate-500 italic leading-relaxed mb-2 line-clamp-2">&ldquo;{note}&rdquo;</p>
                    ) : null
                  })()}

                  {/* Request meta */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                    {/* Where */}
                    {(() => {
                      const where = formatWhere(req)
                      if (where) {
                        const isRideRoute = isRide && req.origin_city && req.destination_city
                        return isRideRoute ? (
                          <span className="flex items-center gap-1.5">
                            <span>🚗</span>
                            <span className="font-medium text-slate-300">{req.origin_city}</span>
                            <span className="text-slate-600">→</span>
                            <span className="font-medium text-slate-300">{req.destination_city}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span>{req.category === 'moving' ? '📦' : '📍'}</span>
                            <span>{where}</span>
                          </span>
                        )
                      }
                      return hasExpectedLocation(req.category) ? (
                        <span className="flex items-center gap-1.5 italic text-slate-600"><span>📍</span>Location not provided</span>
                      ) : null
                    })()}
                    {/* When needed */}
                    {(() => {
                      const when = formatWhen(req)
                      return when ? (
                        <span className="flex items-center gap-1.5"><span>🕐</span>{when}</span>
                      ) : null
                    })()}
                    {/* Budget */}
                    {req.budget != null && (
                      <span className="flex items-center gap-1.5">
                        <span>💵</span>${req.budget}{req.is_driver ? ' / seat' : ''}
                      </span>
                    )}
                  </div>

                  {/* Next-action hint */}
                  {nextAction.variant !== 'open' && (
                    <p className={`text-[11px] ${nextActionColor(nextAction.variant)} mb-3`}>{nextAction.label}</p>
                  )}

                  {/* Your offer details */}
                  {(offer.message || offer.counter_budget != null || offer.final_agreed_price != null) && (
                    <div className="mb-3 rounded-lg border border-[#1e2d4a] bg-white/[0.02] px-3 py-2.5 space-y-1.5">
                      {offer.message && (
                        <p className="text-xs text-slate-400 italic">&ldquo;{offer.message}&rdquo;</p>
                      )}
                      {offer.final_agreed_price != null ? (
                        <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          Agreed: ${offer.final_agreed_price}
                        </span>
                      ) : offer.counter_budget != null ? (
                        <span className="inline-flex rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                          Your offer: ${offer.counter_budget}{req.budget != null ? ` (posted: $${req.budget})` : ''}
                        </span>
                      ) : null}
                    </div>
                  )}

                  {/* Requester's counter — highlighted separately */}
                  {isCountered && offer.requester_counter != null && (
                    <div className="mb-3 rounded-lg border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2.5">
                      <p className="text-[11px] font-medium text-orange-400 mb-1" data-testid="counter-label">
                        {getCounterLabel(pageSubflow, req.is_driver)}
                      </p>
                      <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-300">
                        ${offer.requester_counter}
                      </span>
                    </div>
                  )}

                  {/* Counter action CTA — gated on canActOnOffer */}
                  {isCountered && canActOnOffer(offer.status, req) && (
                    <div className="mb-3 flex gap-2">
                      <button
                        data-testid="accept-counter-btn"
                        type="button"
                        onClick={() => handleAcceptCounter(offer.id, req.id, req.requester_id, req.category, errandType)}
                        disabled={isActing}
                        className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                      >
                        {isActing ? '…' : 'Accept counter'}
                      </button>
                      <button
                        data-testid="decline-counter-btn"
                        type="button"
                        onClick={() => handleDeclineCounter(offer.id, req.id, req.requester_id, req.category, errandType)}
                        disabled={isActing}
                        className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                      >
                        {isActing ? '…' : 'Decline'}
                      </button>
                    </div>
                  )}
                  {isCountered && !canActOnOffer(offer.status, req) && !isEffExpired && (
                    <p data-testid="counter-closed-reason" className="mb-3 text-[11px] text-slate-500 italic">
                      {offerState === 'not_selected'
                        ? 'No actions available — another helper was accepted'
                        : offerState === 'cancelled'
                        ? 'No actions available — request was cancelled'
                        : offerState === 'completed'
                        ? 'No actions available — request was completed'
                        : 'No actions available'}
                    </p>
                  )}

                  {/* Footer: requester info + posted time (secondary only) */}
                  <div className="flex items-center gap-2 border-t border-[#1e2d4a] pt-3">
                    <div className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-700/30 text-[11px] font-semibold text-blue-300">
                      {profile?.name ? profile.name[0].toUpperCase() : '?'}
                    </div>
                    <span className="text-xs text-slate-500">
                      {isRide ? 'Driver' : 'Requested by'}{' '}
                      <span className="text-slate-300">{profile?.name ?? 'A student'}</span>
                    </span>
                    {profile?.rating != null && (
                      <span className="text-xs text-slate-600">★ {Number(profile.rating).toFixed(1)}</span>
                    )}
                    <span className="ml-auto text-xs text-slate-600">Posted {formatPostedTime(req.created_at)}</span>
                    {!blockedRequesterIds.has(req.requester_id) && (
                      <button
                        type="button"
                        data-testid="block-requester-btn"
                        onClick={() => setBlockTarget({ userId: req.requester_id, name: profile?.name ?? undefined })}
                        className="flex-shrink-0 text-[10px] text-slate-700 hover:text-orange-400/70 transition-colors"
                      >
                        Block
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {blockTarget && (
        <BlockModal
          targetUserId={blockTarget.userId}
          displayName={blockTarget.name}
          onClose={() => setBlockTarget(null)}
          onBlocked={() => {
            setBlockedRequesterIds(prev => new Set([...prev, blockTarget.userId]))
          }}
        />
      )}
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
