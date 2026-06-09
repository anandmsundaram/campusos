'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics'
import ReportModal from '@/app/components/ReportModal'
import BlockModal from '@/app/components/BlockModal'
import { getMyBlocks } from '@/lib/blocking'
import TermsModal from '@/app/components/TermsModal'
import { getGateStatus } from '@/lib/terms'
import {
  type OfferSubflow,
  subflowFromCategory,
  getDefaultOfferMessage,
  getOfferNotificationMessage,
  getCounterLabel,
  getStatusLabel,
} from '@/lib/offerText'
import {
  isRequestExpired,
  isOfferEffectivelyExpired,
  isAcceptedPastDue,
  validateOfferAmount,
} from '@/lib/marketplaceLifecycle'
import {
  formatWhere,
  formatWhen,
  formatNote,
  formatNextAction,
  formatPostedTime,
  hasExpectedLocation,
  nextActionColor,
} from '@/lib/cardViewModel'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedRequest {
  id: string
  title: string
  category: string
  urgency: string
  status: string
  location: string | null
  budget: number | null
  scheduled_time: string | null
  created_at: string
  requester_id: string
  profiles: ProfileInfo | ProfileInfo[] | null
  origin_city: string | null
  destination_city: string | null
  is_driver: boolean | null
  available_seats: number | null
  is_round_trip: boolean | null
  flexible_time?: boolean | null
  seats_filled: number | null
  auto_accept: boolean | null
  ride_started: boolean | null
  price_type?: 'fixed' | 'split' | 'free' | null
  is_airport_ride?: boolean | null
  structured_data?: Record<string, unknown> | null
  description?: string | null
  pickup_location?: Record<string, unknown> | null
  dropoff_location?: Record<string, unknown> | null
}

export interface OfferOnCard {
  id: string
  helper_id: string
  message: string | null
  counter_budget: number | null
  status: 'pending' | 'countered' | 'accepted' | 'rejected'
  profiles: ProfileInfo | ProfileInfo[] | null
  requester_counter: number | null
  final_agreed_price: number | null
  seats_requested: number | null
}

export interface FeedRequestWithOffers extends FeedRequest {
  request_offers: OfferOnCard[]
}

export interface MyOffer {
  id: string
  message: string | null
  counter_budget: number | null
  status: 'pending' | 'countered' | 'accepted' | 'rejected'
  confirmed_completion: boolean
  created_at: string
  requests: RequestInfo | RequestInfo[] | null
  requester_counter: number | null
  final_agreed_price: number | null
  seats_requested: number | null
}

interface RequestInfo {
  id: string
  title: string
  category: string
  urgency: string
  status: string
  budget: number | null
  location: string | null
  scheduled_time: string | null
  created_at: string
  requester_id: string
  profiles: ProfileInfo | ProfileInfo[] | null
  is_driver: boolean | null
  available_seats: number | null
  seats_filled: number | null
  structured_data: Record<string, unknown> | null
  origin_city?: string | null
  destination_city?: string | null
  flexible_time?: boolean | null
  description?: string | null
  pickup_location?: Record<string, unknown> | null
  dropoff_location?: Record<string, unknown> | null
}

interface ProfileInfo {
  name: string | null
  rating: number | null
  completed_tasks?: number | null
  university?: string | null
  verification_status?: string | null
}

interface OfferRow {
  id: string
  helper_id: string
  message: string | null
  counter_budget: number | null
  status: 'pending' | 'countered' | 'accepted' | 'rejected'
  profiles: ProfileInfo | ProfileInfo[] | null
  requester_counter: number | null
  final_agreed_price: number | null
  seats_requested: number | null
}

interface OfferTarget {
  requestId: string
  title: string
  budget: number | null
  category: string
  isDriver: boolean | null
  availableSeats: number | null
  seatsFilled: number | null
  errandType: string | null
}

interface OffersTarget {
  requestId: string
  title: string
  category: string
  isDriver: boolean | null
  availableSeats: number | null
  seatsFilled: number | null
  errandType: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  rides: 'Rides',
  moving: 'Moving Help',
  peer_help: 'Peer Help',
  errands: 'Errands',
  borrow: 'Borrow',
}

const CATEGORY_BADGE: Record<string, string> = {
  rides: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  moving: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  peer_help: 'text-green-400 bg-green-500/10 border-green-500/20',
  errands: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  borrow: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
}

const CATEGORY_ACCENT: Record<string, string> = {
  rides: 'bg-blue-500',
  moving: 'bg-orange-500',
  peer_help: 'bg-green-500',
  errands: 'bg-purple-500',
  borrow: 'bg-pink-500',
}

const URGENCY_BADGE: Record<string, string> = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
}

const OFFER_STATUS_BADGE: Record<string, string> = {
  pending:           'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  countered:         'text-orange-400 bg-orange-500/10 border-orange-500/20',
  accepted:          'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  accepted_past_due: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  rejected:          'text-slate-400 bg-white/[0.03] border-white/10',
  expired:           'text-slate-500 bg-slate-500/[0.05] border-slate-300/40',
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  requests: FeedRequest[]
  myRequests: FeedRequestWithOffers[]
  myOffers: MyOffer[]
  currentUserId: string
}

export default function RequestFeed({ requests, myRequests, myOffers, currentUserId }: Props) {
  const router = useRouter()

  const [localMyRequests, setLocalMyRequests] = useState<FeedRequestWithOffers[]>(myRequests)

  // Sync local state when server refreshes (e.g., helper accepts counter → router.refresh())
  useEffect(() => { setLocalMyRequests(myRequests) }, [myRequests])

  // Tab
  const [tab, setTab] = useState<'all' | 'mine' | 'offers'>('all')

  // Filters
  const [catFilter, setCatFilter] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Ride completion state
  const [completingId, setCompletingId] = useState<string | null>(null)

  async function handleCompleteRide(requestId: string, helperIds: string[]) {
    setCompletingId(requestId)
    const supabase = createClient()
    const { data: result, error } = await supabase.rpc('complete_request_safe', { p_request_id: requestId })
    if (error || !result?.ok) { setCompletingId(null); return }
    await Promise.all(helperIds.map(uid =>
      supabase.from('notifications').insert({
        user_id: uid,
        type: 'task_completed',
        message: 'The ride has been marked as complete. Thanks for riding!',
        related_request_id: requestId,
      })
    ))
    setCompletingId(null)
    router.refresh()
  }

  // Offer submission state ("I can help" modal)
  const [offerTarget, setOfferTarget] = useState<OfferTarget | null>(null)
  const [offerMessage, setOfferMessage] = useState('')
  const [counterBudget, setCounterBudget] = useState('')
  const [seatsRequested, setSeatsRequested] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showTermsGate, setShowTermsGate] = useState(false)
  const [pendingOfferReq, setPendingOfferReq] = useState<FeedRequest | null>(null)

  // Card expand state — only one card open at a time
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const toggleCard = useCallback((id: string) => {
    setOpenCardId(prev => (prev === id ? null : id))
  }, [])
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set())

  const now = useMemo(() => new Date(), [])

  const myOffersByRequestId = useMemo(() => {
    const map = new Map<string, MyOffer>()
    for (const o of myOffers) {
      const req = Array.isArray(o.requests) ? o.requests[0] : o.requests
      if (req) map.set(req.id, o)
    }
    return map
  }, [myOffers])

  // Set of requester_ids for whom I've had an accepted offer — used to show
  // "You've worked with this person before" hint on cards in the All Open tab.
  const priorRequesterIds = useMemo(() => {
    const set = new Set<string>()
    for (const o of myOffers) {
      if (o.status !== 'accepted') continue
      const req = Array.isArray(o.requests) ? o.requests[0] : o.requests
      if (req?.requester_id) set.add(req.requester_id)
    }
    return set
  }, [myOffers])

  // Active = open/matched where needed time has not passed yet
  // Past  = completed, cancelled, expired-open, and matched-past-due
  const activeMyRequests = useMemo(
    () => localMyRequests.filter(r => {
      if (r.status === 'open' || r.status === 'matched') {
        return !r.scheduled_time || new Date(r.scheduled_time) >= now
      }
      return false
    }),
    [localMyRequests, now]
  )
  const pastMyRequests = useMemo(
    () => localMyRequests.filter(r => {
      if (r.status === 'completed' || r.status === 'cancelled') return true
      // Expired open request (no accepted offer)
      if (r.status === 'open' && r.scheduled_time && new Date(r.scheduled_time) < now) return true
      // Accepted past-due (offer was accepted but needed time passed, not yet completed)
      if (r.status === 'matched' && r.scheduled_time && new Date(r.scheduled_time) < now) return true
      return false
    }),
    [localMyRequests, now]
  )

  // View-offers modal (requester side)
  const [offersTarget, setOffersTarget] = useState<OffersTarget | null>(null)

  // Report modal
  const [reportTarget, setReportTarget] = useState<{ type: 'request' | 'offer'; id: string; name?: string } | null>(null)

  // Block modal
  const [blockTarget, setBlockTarget] = useState<{ userId: string; name?: string } | null>(null)
  // IDs of users this user has actively blocked — used to hide CTAs
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    getMyBlocks(supabase).then(blocks => {
      setBlockedUserIds(new Set(blocks.map(b => b.blocked_id)))
    }).catch(() => {})
  }, [])

  // Accept/decline handlers update local state immediately
  function handleOfferAccepted(requestId: string, offerId: string, seatsToFill = 1) {
    setLocalMyRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r
      const isMultiSeat = r.is_driver && r.available_seats != null
      const newFilled = isMultiSeat ? (r.seats_filled ?? 0) + seatsToFill : r.seats_filled
      const newStatus = isMultiSeat && newFilled! < r.available_seats! ? 'open' : 'matched'
      return {
        ...r,
        status: newStatus,
        seats_filled: newFilled,
        request_offers: r.request_offers.map(o =>
          o.id === offerId ? { ...o, status: 'accepted' as const } : o
        ),
      }
    }))
  }

  function handleOfferDeclined(requestId: string, offerId: string) {
    setLocalMyRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r
      return {
        ...r,
        request_offers: r.request_offers.map(o =>
          o.id === offerId ? { ...o, status: 'rejected' as const } : o
        ),
      }
    }))
  }

  function handleOfferCountered(requestId: string, offerId: string, amount: number | null) {
    setLocalMyRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r
      return {
        ...r,
        request_offers: r.request_offers.map(o =>
          o.id === offerId ? { ...o, status: 'countered' as const, requester_counter: amount } : o
        ),
      }
    }))
  }

  // Derived request lists
  const filteredRequests = useMemo(() => {
    let items: FeedRequest[] = tab === 'mine'
      ? activeMyRequests
      : requests

    if (catFilter !== 'all') items = items.filter((r) => r.category === catFilter)
    if (urgencyFilter !== 'all') items = items.filter((r) => r.urgency === urgencyFilter)

    if (sortBy === 'budget_high') {
      items = [...items].sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1))
    } else if (sortBy === 'budget_low') {
      items = [...items].sort((a, b) => (a.budget ?? Infinity) - (b.budget ?? Infinity))
    }

    return items
  }, [tab, requests, activeMyRequests, catFilter, urgencyFilter, sortBy])

  const filteredPastRequests = useMemo(() => {
    let items: FeedRequest[] = pastMyRequests
    if (catFilter !== 'all') items = items.filter(r => r.category === catFilter)
    if (urgencyFilter !== 'all') items = items.filter(r => r.urgency === urgencyFilter)
    return items
  }, [pastMyRequests, catFilter, urgencyFilter])

  async function openOfferModal(req: FeedRequest) {
    const supabase = createClient()
    const gate = await getGateStatus(supabase)
    if (gate.mustAcceptTerms) {
      setPendingOfferReq(req)
      setShowTermsGate(true)
      return
    }
    setOfferTarget({ requestId: req.id, title: req.title, budget: req.budget, category: req.category, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null, errandType: (req.structured_data?.errand_type as string | null) ?? null })
    setOfferMessage('')
    setCounterBudget('')
    setSeatsRequested(1)
    setSubmitError(null)
  }

  function handleTermsAccepted() {
    setShowTermsGate(false)
    if (pendingOfferReq) {
      const req = pendingOfferReq
      setPendingOfferReq(null)
      openOfferModal(req)
    }
  }

  function closeOfferModal() {
    if (submitting) return
    setOfferTarget(null)
    setOfferMessage('')
    setCounterBudget('')
    setSeatsRequested(1)
    setSubmitError(null)
  }

  async function handleSubmitOffer(e: React.FormEvent) {
    e.preventDefault()
    if (!offerTarget || submitting) return
    setSubmitError(null)
    setSubmitting(true)

    const amtErr = validateOfferAmount(counterBudget)
    if (amtErr) { setSubmitError(amtErr); setSubmitting(false); return }

    const parsedBudget = counterBudget !== '' ? parseFloat(counterBudget) : null
    const supabase = createClient()

    const isDriveRequest = offerTarget.category === 'rides' && offerTarget.isDriver === true
    const { data: result, error } = await supabase.rpc('submit_offer_safe', {
      p_request_id: offerTarget.requestId,
      p_message: offerMessage.trim() || null,
      p_counter_budget: parsedBudget,
      p_seats_requested: isDriveRequest ? seatsRequested : 1,
    })

    if (error || !result?.ok) {
      setSubmitError(error?.message ?? result?.error ?? 'Failed to submit offer')
      setSubmitting(false)
      return
    }

    // Notify the requester with subflow-aware message
    const reqData = [...requests, ...localMyRequests].find(r => r.id === offerTarget.requestId)
    if (reqData?.requester_id) {
      const notifSubflow = subflowFromCategory(offerTarget.category, offerTarget.errandType)
      const isDriveRequest = offerTarget.category === 'rides' && offerTarget.isDriver === true
      const notifMsg = isDriveRequest
        ? `New seat request for your ride "${offerTarget.title}"`
        : getOfferNotificationMessage('offer_received', notifSubflow, { title: offerTarget.title })
      await supabase.from('notifications').insert({
        user_id: reqData.requester_id,
        type: 'offer_received',
        message: notifMsg,
        related_request_id: offerTarget.requestId,
      })
    }

    trackEvent('offer_submitted', { category: offerTarget.category })
    setOfferedIds((prev) => new Set(prev).add(offerTarget.requestId))
    setSubmitting(false)
    setOfferTarget(null)
    setOfferMessage('')
    setCounterBudget('')
    setSeatsRequested(1)
  }

  // Items needing THIS user's action:
  // - As helper: offers where requester countered back (status='countered')
  // - As requester: requests with fresh pending offers (status='pending' only —
  //   'countered' means requester already countered and is now waiting for the helper)
  const countersPendingMyResponse = myOffers.filter(o => o.status === 'countered')
  const requestsWithPendingOffers = localMyRequests.filter(r =>
    (r.status === 'open' || r.status === 'matched') &&
    r.request_offers.some(o => o.status === 'pending')
  )
  const needsActionCount = countersPendingMyResponse.length + requestsWithPendingOffers.length

  return (
    <>
      {/* Needs-action banner */}
      {needsActionCount > 0 && (
        <div
          data-testid="needs-action-banner"
          className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <span className="text-base leading-none">✉️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {countersPendingMyResponse.length > 0
                ? `You have ${countersPendingMyResponse.length > 1 ? countersPendingMyResponse.length + ' counters' : 'a counter'} to review`
                : `${requestsWithPendingOffers.length} offer${requestsWithPendingOffers.length !== 1 ? 's' : ''} waiting on you`}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {countersPendingMyResponse.length > 0 && requestsWithPendingOffers.length > 0
                ? `${requestsWithPendingOffers.length} offer${requestsWithPendingOffers.length !== 1 ? 's' : ''} on your requests too`
                : countersPendingMyResponse.length > 0
                ? 'Tap to accept or decline the counter'
                : 'Check My Requests to accept or respond'}
            </p>
          </div>
          {countersPendingMyResponse.length > 0 && (
            <button
              type="button"
              onClick={() => setTab('offers')}
              className="flex-shrink-0 rounded-lg bg-amber-100 border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-200"
            >
              Review
            </button>
          )}
          {countersPendingMyResponse.length === 0 && requestsWithPendingOffers.length > 0 && (
            <button
              type="button"
              onClick={() => setTab('mine')}
              className="flex-shrink-0 rounded-lg bg-amber-100 border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-200"
            >
              View offers
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-5">
        {(['all', 'mine', 'offers'] as const).map((t) => {
          const labels = { all: 'All Open', mine: 'My Requests', offers: 'My Offers' }
          const counts = {
            all: requests.length,
            mine: activeMyRequests.length,
            offers: myOffers.length,
          }
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {labels[t]}
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                tab === t ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {counts[t]}
              </span>
              {tab === t && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Filter bar (only for request tabs) */}
      {tab !== 'offers' && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <button
            type="button"
            onClick={() => setCatFilter(catFilter === 'rides' ? 'all' : 'rides')}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              catFilter === 'rides'
                ? 'border-blue-300 bg-blue-100 text-blue-700'
                : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            🚗 Rides
          </button>
          <FilterSelect
            value={catFilter}
            onChange={setCatFilter}
            options={[
              { value: 'all', label: 'All categories' },
              { value: 'rides', label: '🚗 Rides' },
              { value: 'moving', label: '📦 Moving' },
              { value: 'peer_help', label: '🤝 Peer Help' },
              { value: 'errands', label: '🛍️ Errands' },
              { value: 'borrow', label: '📚 Borrow' },
            ]}
          />
          <FilterSelect
            value={urgencyFilter}
            onChange={setUrgencyFilter}
            options={[
              { value: 'all', label: 'Any urgency' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
          <FilterSelect
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'budget_high', label: 'Highest budget' },
              { value: 'budget_low', label: 'Lowest budget' },
            ]}
          />
          <span className="ml-auto text-xs text-slate-600">
            {filteredRequests.length} result{filteredRequests.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Content */}
      {tab === 'offers' ? (
        <MyOffersTab offers={myOffers} currentUserId={currentUserId} />
      ) : tab === 'mine' ? (
        <>
          {filteredRequests.length === 0 && filteredPastRequests.length === 0 ? (
            <EmptyState tab="mine" />
          ) : (
            <>
              {filteredRequests.length > 0 && (
                <div className="flex flex-col gap-3">
                  {filteredRequests.map((req) => {
                    const profile = normalizeProfile(req.profiles)
                    const isOwn = req.requester_id === currentUserId
                    return (
                      <RequestCard
                        key={req.id}
                        req={req}
                        profile={profile}
                        isOwn={isOwn}
                        isExpanded={openCardId === req.id}
                        onToggle={() => toggleCard(req.id)}
                        hasOffered={offeredIds.has(req.id)}
                        onOffer={() => openOfferModal(req)}
                        onViewOffers={() => setOffersTarget({ requestId: req.id, title: req.title, category: req.category, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null, errandType: (req.structured_data?.errand_type as string | null) ?? null })}
                        inlineOffers={
                          isOwn && 'request_offers' in req
                            ? (req as FeedRequestWithOffers).request_offers.filter(o => o.status === 'pending' || o.status === 'countered')
                            : []
                        }
                        acceptedOffers={
                          isOwn && 'request_offers' in req
                            ? (req as FeedRequestWithOffers).request_offers.filter(o => o.status === 'accepted')
                            : undefined
                        }
                        onOfferAccepted={(offerId, seatsToFill) => handleOfferAccepted(req.id, offerId, seatsToFill)}
                        onOfferDeclined={(offerId) => handleOfferDeclined(req.id, offerId)}
                        onOfferCountered={(offerId, amount) => handleOfferCountered(req.id, offerId, amount)}
                        blockedHelperIds={blockedUserIds}
                      />
                    )
                  })}
                </div>
              )}

              {filteredPastRequests.length > 0 && (
                <>
                  <div className="flex items-center gap-3 mt-6 mb-3">
                    <div className="flex-1 border-t border-slate-200" />
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Past</span>
                    <div className="flex-1 border-t border-slate-200" />
                  </div>
                  <div className="flex flex-col gap-3 opacity-60">
                    {filteredPastRequests.map((req) => {
                      const acceptedOffersForCard = 'request_offers' in req
                        ? (req as FeedRequestWithOffers).request_offers.filter(o => o.status === 'accepted')
                        : undefined
                      return (
                        <RequestCard
                          key={req.id}
                          req={req}
                          profile={normalizeProfile(req.profiles)}
                          isOwn
                          isExpanded={openCardId === req.id}
                          onToggle={() => toggleCard(req.id)}
                          hasOffered={false}
                          onOffer={() => {}}
                          onViewOffers={() => setOffersTarget({ requestId: req.id, title: req.title, category: req.category, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null, errandType: (req.structured_data?.errand_type as string | null) ?? null })}
                          inlineOffers={[]}
                            acceptedOffers={acceptedOffersForCard}
                          isPast
                          onComplete={acceptedOffersForCard && acceptedOffersForCard.length > 0
                            ? () => handleCompleteRide(req.id, acceptedOffersForCard.map(o => o.helper_id))
                            : undefined
                          }
                          completing={completingId === req.id}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : filteredRequests.length === 0 ? (
        <EmptyState tab="all" />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRequests.map((req) => {
            const profile = normalizeProfile(req.profiles)
            const isOwn = req.requester_id === currentUserId
            return (
              <RequestCard
                key={req.id}
                req={req}
                profile={profile}
                isOwn={isOwn}
                isExpanded={openCardId === req.id}
                onToggle={() => toggleCard(req.id)}
                hasOffered={offeredIds.has(req.id)}
                myOfferStatus={myOffersByRequestId.get(req.id)?.status ?? null}
                myOfferCounter={myOffersByRequestId.get(req.id)?.requester_counter ?? null}
                myOfferAgreedPrice={(() => { const o = myOffersByRequestId.get(req.id); return o ? (o.final_agreed_price ?? o.requester_counter ?? o.counter_budget) : null })()}
                myOfferSeats={myOffersByRequestId.get(req.id)?.seats_requested ?? 1}
                hasWorkedWithRequester={!isOwn && priorRequesterIds.has(req.requester_id)}
                onGoToOffers={() => setTab('offers')}
                onOffer={() => openOfferModal(req)}
                onViewOffers={() => setOffersTarget({ requestId: req.id, title: req.title, category: req.category, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null, errandType: (req.structured_data?.errand_type as string | null) ?? null })}
                onOfferAccepted={(offerId, seatsToFill) => handleOfferAccepted(req.id, offerId, seatsToFill)}
                onOfferDeclined={(offerId) => handleOfferDeclined(req.id, offerId)}
                onReport={!isOwn ? () => setReportTarget({ type: 'request', id: req.id, name: req.title }) : undefined}
                onBlock={!isOwn && !blockedUserIds.has(req.requester_id) ? () => setBlockTarget({ userId: req.requester_id, name: profile?.name ?? undefined }) : undefined}
                blockedHelperIds={blockedUserIds}
              />
            )
          })}
        </div>
      )}

      {/* Offer / seat-request / ride-offer modal */}
      {offerTarget && (() => {
        const driverPostingSeats = offerTarget.category === 'rides' && offerTarget.isDriver === true
        const passengerNeedsRide = offerTarget.category === 'rides' && offerTarget.isDriver === false
        const offerSubflow = subflowFromCategory(offerTarget.category, offerTarget.errandType)
        const modalTitle = driverPostingSeats ? 'Request a seat'
          : passengerNeedsRide ? 'Offer a ride'
          : offerTarget.category === 'meal_meetup' ? 'Express interest'
          : 'Offer to help'
        const msgPlaceholder = driverPostingSeats
          ? 'e.g. I need 1 seat, happy to split gas…'
          : passengerNeedsRide
          ? 'e.g. I have a car and can pick you up…'
          : getDefaultOfferMessage(offerSubflow)
        const priceLabelShown = !driverPostingSeats && offerTarget.category !== 'meal_meetup'
        const seatsRemaining = driverPostingSeats && offerTarget.availableSeats != null
          ? offerTarget.availableSeats - (offerTarget.seatsFilled ?? 0)
          : null
        return (
          <Modal onBackdropClick={closeOfferModal}>
            <ModalClose onClick={closeOfferModal} disabled={submitting} />
            <h3 className="pr-8 text-sm font-semibold text-white">{modalTitle}</h3>
            <p className="mt-1 pr-8 text-xs text-slate-500 leading-relaxed">
              &ldquo;{offerTarget.title}&rdquo;
            </p>

            <form onSubmit={handleSubmitOffer} className="mt-5 flex flex-col gap-4">
              {driverPostingSeats && seatsRemaining != null && seatsRemaining > 0 && (
                <ModalField label="Seats needed">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setSeatsRequested(s => Math.max(1, s - 1))} disabled={submitting || seatsRequested <= 1}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:border-blue-500/40 hover:text-white disabled:opacity-40 flex items-center justify-center text-lg leading-none">−</button>
                    <span className="text-sm font-semibold text-white w-4 text-center">{seatsRequested}</span>
                    <button type="button" onClick={() => setSeatsRequested(s => Math.min(seatsRemaining, s + 1))} disabled={submitting || seatsRequested >= seatsRemaining}
                      className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:border-blue-500/40 hover:text-white disabled:opacity-40 flex items-center justify-center text-lg leading-none">+</button>
                    <span className="text-xs text-slate-500">{seatsRemaining} available</span>
                  </div>
                </ModalField>
              )}

              <ModalField label="Message" optional>
                <textarea
                  rows={3}
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder={msgPlaceholder}
                  disabled={submitting}
                  className={textareaClass}
                />
              </ModalField>

              {priceLabelShown && (
                <ModalField label={passengerNeedsRide ? 'Price offered per seat' : 'Propose a different price'} optional>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                    <input
                      data-testid="offer-price-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={counterBudget}
                      onChange={(e) => setCounterBudget(e.target.value)}
                      placeholder={offerTarget.budget != null ? String(offerTarget.budget) : '0.00'}
                      disabled={submitting}
                      className={`${inputClass} pl-7`}
                    />
                  </div>
                </ModalField>
              )}

              {submitError && <ErrorBox data-testid="offer-modal-error">{submitError}</ErrorBox>}

              <div className="flex gap-3">
                <button data-testid="offer-submit-btn" type="submit" disabled={submitting} className={primaryBtn}>
                  {submitting ? 'Sending…' : modalTitle}
                </button>
                <button type="button" onClick={closeOfferModal} disabled={submitting} className={secondaryBtn}>
                  Cancel
                </button>
              </div>

              {offerTarget.category === 'rides' && (
                <p className="text-[10px] text-slate-600 leading-relaxed text-center">
                  CampusOS coordinates connections only — confirm all ride details directly with the other student.{' '}
                  <a href="/safety" target="_blank" rel="noopener" className="text-blue-500/70 hover:text-blue-400 transition-colors">Safety tips</a>
                </p>
              )}

              <button
                type="button"
                onClick={() => { closeOfferModal(); setReportTarget({ type: 'request', id: offerTarget.requestId, name: offerTarget.title }) }}
                className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors text-center w-full"
              >
                Report this request
              </button>
            </form>
          </Modal>
        )
      })()}

      {/* View-offers modal (requester side) */}
      {offersTarget && (
        <OffersModal
          requestId={offersTarget.requestId}
          title={offersTarget.title}
          category={offersTarget.category}
          errandType={offersTarget.errandType}
          isDriver={offersTarget.isDriver}
          availableSeats={offersTarget.availableSeats}
          seatsFilled={offersTarget.seatsFilled}
          onClose={() => setOffersTarget(null)}
          onAccepted={() => { setOffersTarget(null); router.refresh() }}
        />
      )}

      {/* Toast */}
      {offeredIds.size > 0 && !offerTarget && (
        <OfferToast key={offeredIds.size} />
      )}

      {/* Report modal */}
      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          displayName={reportTarget.name}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* Block modal */}
      {blockTarget && (
        <BlockModal
          targetUserId={blockTarget.userId}
          displayName={blockTarget.name}
          onClose={() => setBlockTarget(null)}
          onBlocked={() => {
            setBlockedUserIds(prev => new Set([...prev, blockTarget.userId]))
          }}
        />
      )}

      {/* Terms gate */}
      {showTermsGate && (
        <TermsModal
          source="offer_help"
          onAccepted={handleTermsAccepted}
          onDismiss={() => { setShowTermsGate(false); setPendingOfferReq(null) }}
        />
      )}
    </>
  )
}

// ─── Request card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  profile,
  isOwn,
  isExpanded = false,
  onToggle,
  hasOffered,
  myOfferStatus = null,
  myOfferCounter = null,
  myOfferAgreedPrice = null,
  myOfferSeats = 1,
  acceptedOffers,
  hasWorkedWithRequester = false,
  onOffer,
  onViewOffers,
  onGoToOffers,
  inlineOffers = [],
  onOfferAccepted,
  onOfferDeclined,
  onOfferCountered,
  onComplete,
  completing = false,
  isPast = false,
  onReport,
  onBlock,
  blockedHelperIds = new Set(),
}: {
  req: FeedRequest
  profile: ProfileInfo | null
  isOwn: boolean
  isExpanded?: boolean
  onToggle?: () => void
  hasOffered: boolean
  myOfferStatus?: 'pending' | 'countered' | 'accepted' | 'rejected' | null
  myOfferCounter?: number | null
  myOfferAgreedPrice?: number | null
  myOfferSeats?: number
  acceptedOffers?: OfferOnCard[]
  hasWorkedWithRequester?: boolean
  onOffer: () => void
  onViewOffers: () => void
  onGoToOffers?: () => void
  inlineOffers?: OfferOnCard[]
  onOfferAccepted?: (offerId: string, seatsToFill?: number) => void
  onOfferDeclined?: (offerId: string) => void
  onOfferCountered?: (offerId: string, amount: number | null) => void
  onComplete?: () => void
  completing?: boolean
  isPast?: boolean
  onReport?: () => void
  onBlock?: () => void
  blockedHelperIds?: Set<string>
}) {
  const isRide = req.category === 'rides'
  const isFull = isRide && req.is_driver === true && req.available_seats != null && (req.seats_filled ?? 0) >= req.available_seats
  const rideStarted = isRide && (req.ride_started ?? false)
  const hasSeatsSold = isRide && req.is_driver === true &&
    ((req.seats_filled ?? 0) > 0 || (acceptedOffers && acceptedOffers.length > 0))
  const isExpired = isPast && req.status === 'open' && !hasSeatsSold
  const isPastRide = isPast && !!hasSeatsSold

  const cardRef = useRef<HTMLDivElement>(null)

  // Close this card when user clicks outside it
  useEffect(() => {
    if (!isExpanded) return
    const handleOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onToggle?.()
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handleOutside), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleOutside) }
  }, [isExpanded, onToggle])

  // Trust signal derivations — used in card footer
  const completedTasksCount = profile?.completed_tasks ?? 0
  const isTrusted = (profile?.rating ?? 0) >= 4.3 && completedTasksCount >= 5

  // Context-aware action label
  const ctaLabel = isRide
    ? (req.is_driver ? 'Request a seat' : 'Offer a ride')
    : req.category === 'meal_meetup' ? "I'm interested"
    : 'I can help'
  const accentClass = isRide
    ? (req.is_driver ? 'bg-blue-500' : 'bg-purple-500')
    : (CATEGORY_ACCENT[req.category] ?? 'bg-slate-500')

  return (
    <div
      ref={cardRef}
      data-testid="request-card"
      data-request-id={req.id}
      className={`group relative overflow-hidden rounded-xl border transition-all duration-300 ${
        isExpanded
          ? 'border-blue-300 bg-white shadow-lg shadow-blue-100/60 -translate-y-0.5'
          : 'border-slate-200 bg-white hover:border-blue-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/80'
      }`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentClass}`} />

      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* FRONT FACE — clicking this area opens details */}
        <div
          data-testid="request-card-front"
          onClick={() => onToggle?.()}
          className="cursor-pointer select-none"
        >
        {/* Title / Route heading — primary scan target */}
        <div className="flex items-start gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            {isRide && req.origin_city && req.destination_city ? (
              <>
                <p className="text-base font-bold text-slate-900 leading-tight">
                  {req.origin_city}
                  <span className="mx-2 font-normal text-slate-500">→</span>
                  {req.destination_city}
                </p>
                {req.title && (
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{req.title}</p>
                )}
              </>
            ) : (
              <p className="text-[15px] font-semibold text-slate-900 leading-snug">{req.title}</p>
            )}
          </div>
          {/* Role badge — right of title */}
          {isOwn ? (
            <span data-testid="card-role-status" className="flex-shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-slate-600">
              My request{inlineOffers.length > 0 ? ` · ${inlineOffers.length} offer${inlineOffers.length !== 1 ? 's' : ''}` : ''}
            </span>
          ) : myOfferStatus != null ? (
            <span data-testid="card-role-status" className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${OFFER_STATUS_BADGE[myOfferStatus]}`}>
              {myOfferStatus === 'accepted' ? '✓ Accepted'
               : myOfferStatus === 'countered' ? '↩ Counter'
               : myOfferStatus === 'rejected' ? 'Declined'
               : 'Offered ✓'}
            </span>
          ) : hasOffered ? (
            <span data-testid="card-role-status" className="flex-shrink-0 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-yellow-400">
              Offered ✓
            </span>
          ) : null}
        </div>

        {/* Parser summary — context hint, shown when collapsed */}
        {!isRide && !isExpanded && typeof req.structured_data?.summary === 'string' && (
          <p data-testid="card-summary" className="text-xs text-slate-500 leading-relaxed mb-2 line-clamp-2">
            {req.structured_data.summary}
          </p>
        )}

        {/* Meta row */}
        <div data-testid="request-card-key-details" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-2">
          {/* Non-ride location — prefer resolved pickup_location/dropoff_location */}
          {!isRide && (() => {
            if (req.category === 'errands') {
              const loc = (req.pickup_location?.place_name as string | undefined)
                ?? (req.structured_data?.store_or_place as string | undefined)
              return loc ? (
                <span data-testid="card-location-meta" className="flex items-center gap-1.5">
                  <span className="text-[11px]">📍</span>
                  <span>{loc}</span>
                </span>
              ) : null
            }
            if (req.category === 'moving') {
              const from = req.pickup_location?.place_name as string | undefined
              const to = req.dropoff_location?.place_name as string | undefined
              if (from && to) return (
                <span data-testid="card-location-meta" className="flex items-center gap-1.5">
                  <span className="text-[11px]">📦</span>
                  <span className="font-medium text-slate-700">{from}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-medium text-slate-700">{to}</span>
                </span>
              )
              if (from) return (
                <span data-testid="card-location-meta" className="flex items-center gap-1.5">
                  <span className="text-[11px]">📍</span>
                  <span>From: {from}</span>
                </span>
              )
              return null
            }
            if (req.category === 'meal_meetup') {
              const mmSd = req.structured_data as Record<string, unknown> | null
              const mmPlace = (typeof mmSd?.restaurant_or_area === 'string' ? mmSd.restaurant_or_area : null)
                ?? (req.pickup_location?.place_name as string | undefined)
              return mmPlace ? (
                <span data-testid="card-location-meta" className="flex items-center gap-1.5">
                  <span className="text-[11px]">🍽️</span>
                  <span>{mmPlace}</span>
                </span>
              ) : null
            }
            if (req.category === 'peer_help') return null
            if (req.category === 'borrow') {
              const borrowLoc = req.pickup_location?.place_name as string | undefined
              return borrowLoc ? (
                <span data-testid="card-location-meta" className="flex items-center gap-1.5">
                  <span className="text-[11px]">📍</span>
                  <span>{borrowLoc}</span>
                </span>
              ) : null
            }
            if (req.origin_city && req.destination_city) return (
              <span className="flex items-center gap-1.5">
                <span className="text-[11px]">🚗</span>
                <span className="font-medium text-slate-700">{req.origin_city}</span>
                <span className="text-slate-400">→</span>
                <span className="font-medium text-slate-700">{req.destination_city}</span>
              </span>
            )
            return req.location ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[11px]">📍</span>
                {req.location}
              </span>
            ) : null
          })()}
          {(() => {
            const when = formatWhen(req)
            return when ? (
              <span data-testid="card-time-meta" className="flex items-center gap-1.5">
                <span className="text-[11px]">🕐</span>
                {when}
              </span>
            ) : null
          })()}
          {/* Money — priority: final agreed → counter from requester → payment summary → budget */}
          {(() => {
            const moneySd = req.structured_data as Record<string, unknown> | null
            if (!isOwn && myOfferStatus === 'accepted' && myOfferAgreedPrice != null) {
              return (
                <span data-testid="card-final-price" className="flex items-center gap-1.5 text-emerald-400">
                  <span className="text-[11px]">💰</span>
                  <span className="font-medium">Final: ${myOfferAgreedPrice}</span>
                </span>
              )
            }
            if (!isOwn && myOfferStatus === 'countered' && myOfferCounter != null) {
              return (
                <span data-testid="card-counter-price" className="flex items-center gap-1.5 text-orange-400">
                  <span className="text-[11px]">💳</span>
                  <span>Counter: ${myOfferCounter}</span>
                </span>
              )
            }
            if (moneySd?.payment_summary) {
              return (
                <span data-testid="card-payment-meta" className="flex items-center gap-1.5">
                  <span className="text-[11px]">💳</span>
                  {String(moneySd.payment_summary)}
                </span>
              )
            }
            if (req.budget != null) {
              return (
                <span data-testid="card-payment-meta" className="flex items-center gap-1.5">
                  <span className="text-[11px]">💵</span>
                  ${req.budget}{isRide && req.is_driver ? ' / seat' : ''}
                </span>
              )
            }
            return null
          })()}
          {/* Driver info — shown to non-owners browsing ride cards */}
          {isRide && !isOwn && profile && (
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px]">👤</span>
              <span className="text-slate-700">{profile.name ?? 'A student'}</span>
              {profile.rating != null && (
                <span className={Number(profile.rating) >= 4.5 ? 'text-yellow-400 font-medium' : 'text-slate-600'}>
                  ★ {Number(profile.rating).toFixed(1)}
                </span>
              )}
              {(profile.completed_tasks ?? 0) > 0 && (
                <span className="text-slate-600">{profile.completed_tasks} rides</span>
              )}
            </span>
          )}
          {/* Category-specific capacity / key-info chips */}
          {req.category === 'moving' && (() => {
            const mvHelpers = (req.structured_data as Record<string, unknown> | null)?.helpers_needed
            return mvHelpers != null ? (
              <span data-testid="card-capacity-meta" className="flex items-center gap-1.5">
                <span className="text-[11px]">👥</span>
                {Number(mvHelpers)} helper{Number(mvHelpers) !== 1 ? 's' : ''} needed
              </span>
            ) : null
          })()}
          {req.category === 'peer_help' && (() => {
            const phSd = req.structured_data as Record<string, unknown> | null
            const phSubject = typeof phSd?.subject === 'string' ? phSd.subject : null
            return phSubject ? (
              <span data-testid="card-subject-meta" className="flex items-center gap-1.5">
                <span className="text-[11px]">📚</span>
                {phSubject}
              </span>
            ) : null
          })()}
          {req.category === 'peer_help' && (() => {
            const phVirtual = (req.structured_data as Record<string, unknown> | null)?.is_virtual
            let phFmt: string | null = null
            if (phVirtual === true || phVirtual === 'true') phFmt = 'Virtual'
            else if (phVirtual === false || phVirtual === 'false') phFmt = 'In person'
            else if (phVirtual === 'either') phFmt = 'Virtual or in person'
            return phFmt ? (
              <span data-testid="card-format-meta" className="flex items-center gap-1.5">
                <span className="text-[11px]">💻</span>
                {phFmt}
              </span>
            ) : null
          })()}
          {req.category === 'borrow' && (() => {
            const bwSd = req.structured_data as Record<string, unknown> | null
            const bwItem = typeof bwSd?.item === 'string' ? bwSd.item : null
            return bwItem ? (
              <span data-testid="card-item-meta" className="flex items-center gap-1.5">
                <span className="text-[11px]">📦</span>
                {bwItem}
              </span>
            ) : null
          })()}
          {req.category === 'borrow' && (() => {
            const bwSd = req.structured_data as Record<string, unknown> | null
            const bwDur = (typeof bwSd?.duration === 'string' ? bwSd.duration : null)
              ?? (typeof bwSd?.borrow_duration === 'string' ? bwSd.borrow_duration : null)
            return bwDur ? (
              <span data-testid="card-duration-meta" className="flex items-center gap-1.5">
                <span className="text-[11px]">📅</span>
                {bwDur}
              </span>
            ) : null
          })()}
        </div>

        {/* Structured data meta chips — non-ride categories only */}
        {!isRide && <StructuredDataMeta category={req.category} sd={req.structured_data} />}

        {/* Category + status badges — secondary, after title and key details */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <Badge text={CATEGORY_LABELS[req.category] ?? req.category} color={CATEGORY_BADGE[req.category]} />
          {req.urgency !== 'low' && (
            <Badge text={req.urgency} color={URGENCY_BADGE[req.urgency]} capitalize />
          )}
          {isRide && req.is_driver !== null && (
            <Badge
              text={req.is_driver ? '🚗 Driver' : '🙋 Passenger'}
              color={req.is_driver
                ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                : 'text-purple-400 bg-purple-500/10 border-purple-500/20'}
            />
          )}
          {isRide && req.is_driver && req.available_seats != null && (
            isFull ? (
              <Badge text="FULL" color="text-red-400 bg-red-500/10 border-red-500/20" />
            ) : (
              <span data-testid="seats-badge">
                <Badge
                  text={`${req.available_seats - (req.seats_filled ?? 0)} of ${req.available_seats} seats left`}
                  color="text-slate-400 bg-white/[0.03] border-slate-200"
                />
              </span>
            )
          )}
          {isRide && req.is_round_trip && (
            <Badge text="Round trip" color="text-slate-400 bg-white/[0.03] border-slate-200" />
          )}
          {isPastRide && req.status !== 'completed' && (
            <Badge text="Pending completion" color="text-yellow-400 bg-yellow-500/10 border-yellow-500/20" />
          )}
          {isExpired && (
            <Badge text="Expired" color="text-slate-500 bg-white/[0.02] border-slate-200" />
          )}
          {req.status === 'completed' && (
            <Badge text="Completed" color="text-emerald-400 bg-emerald-500/10 border-emerald-500/20" />
          )}
        </div>

        </div>{/* end request-card-front */}

        {/* Animated detail section — always rendered, animated in/out */}
        <div
          data-testid="request-card-details"
          id={`detail-${req.id}`}
          aria-hidden={!isExpanded}
          style={{ maxHeight: isExpanded ? '1400px' : '0' }}
          className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="mt-3 mb-1 rounded-xl border border-blue-500/20 bg-slate-50/60">
            {/* Detail header with close button */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-slate-200/50">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Details</span>
              <button
                type="button"
                data-testid="request-card-detail-close"
                onClick={(e) => { e.stopPropagation(); onToggle?.() }}
                className="text-slate-500 hover:text-slate-300 transition-colors text-[13px] leading-none px-1"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            <div className="px-3 py-3 space-y-3">
              {/* Original request text */}
              {req.description && (
                <p
                  data-testid="request-card-original-text"
                  className="text-xs text-slate-400 italic leading-relaxed border-l-2 border-slate-200 pl-3"
                >
                  &ldquo;{req.description}&rdquo;
                </p>
              )}

              {/* Time row */}
              {(() => {
                const when = formatWhen(req)
                return when ? (
                  <div data-testid="request-card-time" className="flex items-start gap-2">
                    <span className="text-[11px] mt-0.5 flex-shrink-0">🕐</span>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-0.5">When</p>
                      <p className="text-xs text-slate-700">{when}</p>
                    </div>
                  </div>
                ) : null
              })()}

              {/* Payment row */}
              {(!!(req.structured_data as Record<string, unknown> | null)?.payment_summary || req.budget != null) && (
                <div data-testid="request-card-payment" className="flex items-start gap-2">
                  <span className="text-[11px] mt-0.5 flex-shrink-0">💳</span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-0.5">Payment</p>
                    <p className="text-xs text-slate-700">
                      {(req.structured_data as Record<string, unknown> | null)?.payment_summary
                        ? String((req.structured_data as Record<string, unknown>).payment_summary)
                        : `$${req.budget}${isRide && req.is_driver ? ' / seat' : ''}`
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Location row (non-ride) */}
              {!isRide && (!!(req.pickup_location?.place_name) || !!(req.dropoff_location?.place_name)) && (
                <div data-testid="request-card-location" className="flex items-start gap-2">
                  <span className="text-[11px] mt-0.5 flex-shrink-0">📍</span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-0.5">Location</p>
                    {!!(req.pickup_location?.place_name) && (
                      <p className="text-xs text-slate-700">{req.pickup_location!.place_name as string}</p>
                    )}
                    {!!(req.dropoff_location?.place_name) && (
                      <p className="text-xs text-slate-400 mt-0.5">→ {req.dropoff_location!.place_name as string}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Enhanced category-specific structured fields */}
              {req.structured_data && (
                <ExpandedStructuredData category={req.category} sd={req.structured_data} />
              )}

              {/* Primary CTA mirrored inside detail panel for quick access */}
              {!isOwn && !hasOffered && !myOfferStatus && !isPast && !isFull && !rideStarted && (
                <button
                  data-testid="request-card-primary-cta"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOffer?.() }}
                  className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 active:scale-95"
                >
                  {ctaLabel}
                </button>
              )}
            </div>
          </div>
        </div>{/* end animated detail section */}

        {/* Passengers section — driver's own card with accepted bookings */}
        {isOwn && isRide && req.is_driver && acceptedOffers && acceptedOffers.length > 0 && (() => {
          const totalLocked = acceptedOffers.reduce((sum, o) => {
            const p = (o.final_agreed_price ?? o.requester_counter ?? o.counter_budget ?? req.budget) ?? 0
            return sum + p * (o.seats_requested ?? 1)
          }, 0)
          const seatsOpen = (req.available_seats ?? 0) - acceptedOffers.reduce((s, o) => s + (o.seats_requested ?? 1), 0)
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Passengers
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-emerald-400">${totalLocked} locked in</span>
                  {seatsOpen > 0 && (
                    <span className="text-slate-500">{seatsOpen} open @ ${req.budget}</span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {acceptedOffers.map(o => {
                  const pax = normalizeProfile(o.profiles)
                  const agreedPrice = o.final_agreed_price ?? o.requester_counter ?? o.counter_budget
                  const seatCount = o.seats_requested ?? 1
                  return (
                    <div key={o.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/[0.02] px-3 py-2">
                      <Avatar name={pax?.name} size="sm" />
                      <span className="text-xs font-medium text-slate-700">{pax?.name ?? 'Anonymous'}</span>
                      {pax?.rating != null && (
                        <span className="text-xs text-slate-600">★ {Number(pax.rating).toFixed(1)}</span>
                      )}
                      <span className="ml-auto text-xs text-slate-400">
                        {seatCount} seat{seatCount !== 1 ? 's' : ''}
                        {agreedPrice != null ? ` · $${agreedPrice}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Inline pending offers — shown in My Requests tab for the requester */}
        {inlineOffers.length > 0 && (
          <div className="mb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {inlineOffers.length} pending offer{inlineOffers.length !== 1 ? 's' : ''}
            </p>
            {inlineOffers.map(offer => (
              <InlineOfferRow
                key={offer.id}
                offer={offer}
                requestId={req.id}
                category={req.category}
                errandType={(req.structured_data?.errand_type as string | null) ?? null}
                isDriver={req.is_driver}
                availableSeats={req.available_seats}
                seatsFilled={req.seats_filled}
                isBlockedHelper={blockedHelperIds.has(offer.helper_id)}
                onAccepted={() => onOfferAccepted?.(offer.id, offer.seats_requested ?? 1)}
                onDeclined={() => onOfferDeclined?.(offer.id)}
                onCountered={(id, amount) => onOfferCountered?.(id, amount)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <Avatar name={profile?.name} />
            <span className="text-xs text-slate-600 font-medium truncate max-w-[120px]">
              {profile?.name ?? 'A student'}
            </span>
            {hasWorkedWithRequester && (
              <span className="flex-shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[9px] font-semibold leading-none text-emerald-400">
                Worked together
              </span>
            )}
            {profile?.rating != null && (
              <span className={`flex-shrink-0 text-xs ${Number(profile.rating) >= 4.5 ? 'text-yellow-400 font-medium' : 'text-slate-600'}`}>
                ★ {Number(profile.rating).toFixed(1)}
              </span>
            )}
            {isTrusted && (
              <span className="flex-shrink-0 rounded-full border border-yellow-500/20 bg-yellow-500/[0.06] px-1.5 py-0.5 text-[9px] font-semibold leading-none text-yellow-400/80">
                Trusted
              </span>
            )}
            {completedTasksCount > 0 && (
              <span className="flex-shrink-0 text-[10px] text-slate-600">
                {completedTasksCount} helped
              </span>
            )}
            <span className="flex-shrink-0 text-xs text-slate-700">·</span>
            <span className="flex-shrink-0 text-xs text-slate-600">{timeAgo(req.created_at)}</span>
            {onReport && (
              <>
                <span className="flex-shrink-0 text-xs text-slate-700">·</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReport() }}
                  className="flex-shrink-0 text-[10px] text-slate-700 hover:text-red-400/70 transition-colors"
                >
                  Report
                </button>
              </>
            )}
            {onBlock && (
              <>
                <span className="flex-shrink-0 text-xs text-slate-700">·</span>
                <button
                  type="button"
                  data-testid="block-user-btn"
                  onClick={(e) => { e.stopPropagation(); onBlock() }}
                  className="flex-shrink-0 text-[10px] text-slate-700 hover:text-orange-400/70 transition-colors"
                >
                  Block
                </button>
              </>
            )}
            <span className="flex-shrink-0 text-xs text-slate-700">·</span>
            <button
              type="button"
              data-testid="request-card-toggle"
              aria-expanded={isExpanded}
              aria-controls={`detail-${req.id}`}
              onClick={(e) => { e.stopPropagation(); onToggle?.() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle?.() } }}
              className={`flex-shrink-0 text-[11px] font-medium transition-colors ${isExpanded ? 'text-blue-600 hover:text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {isExpanded ? 'Less ▴' : 'Details ▾'}
            </button>
          </div>

          {isPast ? (
            req.status === 'completed'
              ? <span data-testid="req-completed-label" className="text-xs font-semibold text-emerald-400">Completed ✓</span>
              : req.status === 'matched'
              ? <span data-testid="req-past-due-label" className="text-xs font-semibold text-amber-500">Past due — awaiting completion</span>
              : isPastRide && onComplete
              ? (
                <button
                  data-testid="mark-complete-btn"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onComplete() }}
                  disabled={completing}
                  className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                >
                  {completing ? '…' : 'Mark complete'}
                </button>
              )
              : <span data-testid="req-expired-label" className="text-xs text-slate-500">Expired — no helper accepted</span>
          ) : isOwn ? (
            <button
              data-testid="view-offers-btn"
              type="button"
              onClick={(e) => { e.stopPropagation(); onViewOffers() }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-white/20 hover:text-slate-200"
            >
              View offers
            </button>
          ) : (hasOffered || myOfferStatus) ? (
            myOfferStatus === 'countered' ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onGoToOffers?.() }}
                className="flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/[0.08] px-3 py-1.5 text-xs font-semibold text-orange-400 transition-all hover:bg-orange-500/15 active:scale-95"
              >
                ↩ Counter{myOfferCounter != null ? ` $${myOfferCounter}` : ''} — tap to respond
              </button>
            ) : (
              <span className={`text-xs font-semibold ${
                myOfferStatus === 'rejected' ? 'text-slate-500'
                : 'text-emerald-400'
              }`}>
                {myOfferStatus === 'accepted'
                  ? `✓ Accepted${myOfferAgreedPrice != null ? ` · ${myOfferSeats > 1 ? `${myOfferSeats}× ` : ''}$${myOfferAgreedPrice}` : ''}`
                  : myOfferStatus === 'rejected' ? 'Declined'
                  : 'Offer sent ✓'}
              </span>
            )
          ) : isFull ? (
            <span className="text-xs font-semibold text-red-400/70">Full</span>
          ) : rideStarted ? (
            <span className="text-xs font-medium text-slate-500">Ride started</span>
          ) : (
            <button
              data-testid="offer-cta-btn"
              type="button"
              onClick={(e) => { e.stopPropagation(); onOffer() }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-blue-500 active:scale-95"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Inline offer row (accept/decline on card) ───────────────────────────────

function InlineOfferRow({
  offer,
  requestId,
  category,
  errandType,
  isDriver,
  availableSeats,
  seatsFilled,
  isBlockedHelper = false,
  onAccepted,
  onDeclined,
  onCountered,
}: {
  offer: OfferOnCard
  requestId: string
  category: string
  errandType: string | null
  isDriver: boolean | null
  availableSeats: number | null
  seatsFilled: number | null
  isBlockedHelper?: boolean
  onAccepted: () => void
  onDeclined: () => void
  onCountered?: (offerId: string, amount: number | null) => void
}) {
  const [acting, setActing] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [showCounter, setShowCounter] = useState(false)
  const [counterAmt, setCounterAmt] = useState('')
  const profile = normalizeProfile(offer.profiles)
  const rowSubflow = subflowFromCategory(category, errandType)
  const isMealMeetup = category === 'meal_meetup'

  async function accept() {
    setActing(true)
    setRowError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setRowError('Not authenticated'); setActing(false); return }
    const { data: result, error } = await supabase.rpc('accept_offer_atomic', {
      p_offer_id: offer.id,
      p_accepted_by: user.id,
    })
    if (error || !result?.ok) {
      setRowError(error?.message ?? result?.error ?? 'Failed to accept offer')
      setActing(false)
      return
    }
    await supabase.from('notifications').insert({
      user_id: offer.helper_id,
      type: 'offer_accepted',
      message: getOfferNotificationMessage('offer_accepted', rowSubflow),
      related_request_id: requestId,
    })
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: offer.helper_id,
      request_id: requestId,
      content: '✓ Offer accepted! Chat here to coordinate.',
    })
    setActing(false)
    onAccepted()
  }

  async function decline() {
    setActing(true)
    setRowError(null)
    const supabase = createClient()
    const { data: check } = await supabase.rpc('validate_offer_action', { p_request_id: requestId })
    if (!check?.ok) { setRowError(check?.error ?? 'This request is no longer active'); setActing(false); return }
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offer.id)
    if (error) { setRowError(error.message); setActing(false); return }
    await supabase.from('notifications').insert({
      user_id: offer.helper_id,
      type: 'offer_rejected',
      message: getOfferNotificationMessage('offer_declined', rowSubflow),
      related_request_id: requestId,
    })
    setActing(false)
    onDeclined()
  }

  async function submitCounter() {
    const amtErr = validateOfferAmount(counterAmt)
    if (amtErr) { setRowError(amtErr); return }
    setActing(true)
    setRowError(null)
    const supabase = createClient()
    const { data: check } = await supabase.rpc('validate_offer_action', { p_request_id: requestId })
    if (!check?.ok) { setRowError(check?.error ?? 'This request is no longer active'); setActing(false); return }
    const amt = counterAmt !== '' ? parseFloat(counterAmt) : null
    const { error } = await supabase.from('request_offers')
      .update({ status: 'countered', requester_counter: amt })
      .eq('id', offer.id)
    if (error) { setRowError(error.message); setActing(false); return }
    await supabase.from('notifications').insert({
      user_id: offer.helper_id,
      type: 'counter_offer',
      message: getOfferNotificationMessage('counter_sent', rowSubflow, { amount: amt }),
      related_request_id: requestId,
    })
    setActing(false)
    setShowCounter(false)
    onCountered?.(offer.id, amt)
  }

  const isCountered = offer.status === 'countered'

  return (
    <div className="rounded-lg border border-slate-200 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={profile?.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-slate-900">{profile?.name ?? 'Anonymous'}</span>
            {profile?.rating != null && (
              <span className="text-xs text-slate-500">★ {Number(profile.rating).toFixed(1)}</span>
            )}
            {offer.counter_budget != null && (
              <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
                ${offer.counter_budget}
              </span>
            )}
            {isCountered && offer.requester_counter != null && (
              <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400">
                Counter: ${offer.requester_counter}
              </span>
            )}
          </div>
          {offer.message && (
            <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">{offer.message}</p>
          )}
        </div>
        {isBlockedHelper ? (
          <span className="text-[11px] text-slate-600 flex-shrink-0 italic">Blocked</span>
        ) : isCountered ? (
          <span data-testid="counter-sent-status" className="text-[11px] text-orange-400 flex-shrink-0">Counter sent ✓</span>
        ) : (
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              data-testid="accept-inline-btn"
              type="button"
              onClick={accept}
              disabled={acting}
              className="rounded-lg bg-emerald-600/80 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              {acting ? '…' : 'Accept'}
            </button>
            <button
              data-testid="decline-inline-btn"
              type="button"
              onClick={decline}
              disabled={acting}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
            >
              {acting ? '…' : 'Decline'}
            </button>
            {!isMealMeetup && (
              <button
                data-testid="counter-inline-btn"
                type="button"
                onClick={() => setShowCounter(v => !v)}
                disabled={acting}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-orange-500/30 hover:text-orange-400 disabled:opacity-40"
              >
                Counter
              </button>
            )}
          </div>
        )}
      </div>

      {showCounter && !isCountered && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">$</span>
            <input
              data-testid="counter-inline-input"
              type="number"
              min="0"
              step="0.01"
              value={counterAmt}
              onChange={e => setCounterAmt(e.target.value)}
              placeholder="Your price"
              disabled={acting}
              className="w-full rounded-lg border border-slate-300 bg-white pl-6 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-orange-400 disabled:opacity-50"
            />
          </div>
          <button
            data-testid="counter-inline-send"
            type="button"
            onClick={submitCounter}
            disabled={acting}
            className="rounded-lg bg-orange-600/80 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-40"
          >
            {acting ? '…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => { setShowCounter(false); setCounterAmt('') }}
            disabled={acting}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}

      {rowError && <p data-testid="inline-offer-error" className="mt-1.5 text-[11px] text-red-400">{rowError}</p>}
    </div>
  )
}

// ─── My Offers tab ────────────────────────────────────────────────────────────

function MyOffersTab({ offers: initialOffers, currentUserId }: { offers: MyOffer[]; currentUserId: string }) {
  const router = useRouter()
  const [offers, setOffers] = useState<MyOffer[]>(initialOffers)
  const [acting, setActing] = useState<string | null>(null)
  const [actError, setActError] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])

  // Set of requester_ids for whom I've had 2+ accepted offers — "regulars"
  const repeatRequesterIds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of offers) {
      if (o.status !== 'accepted') continue
      const req = Array.isArray(o.requests) ? o.requests[0] : o.requests
      if (req?.requester_id) counts.set(req.requester_id, (counts.get(req.requester_id) ?? 0) + 1)
    }
    const set = new Set<string>()
    for (const [id, count] of counts) { if (count >= 2) set.add(id) }
    return set
  }, [offers])

  async function markRideComplete(offerId: string, requestId: string, requesterId: string) {
    setActing(offerId)
    setActError(null)
    const supabase = createClient()
    await supabase.from('request_offers')
      .update({ confirmed_completion: true, confirmed_at: new Date().toISOString() })
      .eq('id', offerId)
    const { data: result, error } = await supabase.rpc('complete_request_safe', { p_request_id: requestId })
    if (error || !result?.ok) { setActError(error?.message ?? result?.error ?? 'Failed to mark complete'); setActing(null); return }
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'task_completed',
      message: 'A passenger confirmed the ride is complete.',
      related_request_id: requestId,
    })
    setOffers(prev => prev.map(o => o.id === offerId ? { ...o, confirmed_completion: true } : o))
    setActing(null)
    router.refresh()
  }

  function subflowForOffer(offerId: string): OfferSubflow {
    const o = offers.find(x => x.id === offerId)
    const r = o ? (Array.isArray(o.requests) ? o.requests[0] : o.requests) : null
    return r ? subflowFromCategory(r.category, r.structured_data?.errand_type as string | null) : 'unknown'
  }

  async function acceptCounter(offerId: string, requestId: string, requesterId: string) {
    setActing(offerId)
    setActError(null)
    const supabase = createClient()
    const { data: result, error } = await supabase.rpc('accept_offer_atomic', {
      p_offer_id: offerId,
      p_accepted_by: currentUserId,
    })
    if (error || !result?.ok) {
      setActError(error?.message ?? result?.error ?? 'Failed to accept counter-offer')
      setActing(null)
      return
    }
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'offer_accepted',
      message: getOfferNotificationMessage('counter_accepted', subflowForOffer(offerId)),
      related_request_id: requestId,
    })
    await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: requesterId,
      request_id: requestId,
      content: '✓ Counter accepted! Chat here to coordinate.',
    })
    setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'accepted' as const } : o))
    setActing(null)
    router.refresh()
  }

  async function declineCounter(offerId: string, requestId: string, requesterId: string) {
    setActing(offerId)
    setActError(null)
    const supabase = createClient()
    const { data: check } = await supabase.rpc('validate_offer_action', { p_request_id: requestId })
    if (!check?.ok) { setActError(check?.error ?? 'This request is no longer active'); setActing(null); return }
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offerId)
    if (error) { setActError(error.message); setActing(null); return }
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'offer_rejected',
      message: getOfferNotificationMessage('counter_declined', subflowForOffer(offerId)),
      related_request_id: requestId,
    })
    setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'rejected' as const } : o))
    setActing(null)
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white/60 py-14 px-6 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl">🤝</div>
        <p className="text-sm font-medium text-slate-400">You haven&apos;t offered help yet</p>
        <p className="mt-1.5 max-w-xs text-xs text-slate-600 leading-relaxed">
          Switch to <span className="text-slate-400 font-medium">All Open</span> to browse requests from students on your campus.
          Hit &ldquo;I can help&rdquo; on anything that fits — rides, errands, tutoring, or moving.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {actError && <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-xs text-red-400">{actError}</p>}
      {offers.map((offer) => {
        const req = Array.isArray(offer.requests) ? offer.requests[0] : offer.requests
        if (!req) return null
        const profile = normalizeProfile(req.profiles)
        const isCountered = offer.status === 'countered'
        const isActing = acting === offer.id

        const agreedPrice = offer.final_agreed_price ?? offer.requester_counter ?? offer.counter_budget
        const seats = offer.seats_requested ?? 1
        const offerSubflow = subflowFromCategory(req.category, req.structured_data?.errand_type as string | null)
        const isEffExpired = isOfferEffectivelyExpired(offer.status, req)
        const isPastDue = isAcceptedPastDue(offer.status, req, req.status)
        const displayStatusKey = isEffExpired ? 'expired' : isPastDue ? 'accepted_past_due' : offer.status
        const statusLabel = isEffExpired
          ? 'Expired'
          : isPastDue
          ? 'Past due'
          : getStatusLabel(offer.status, offerSubflow, { agreedPrice, seats })

        return (
          <div
            key={offer.id}
            data-testid="my-offer-card"
            data-offer-id={offer.id}
            data-offer-status={offer.status}
            className={`relative overflow-hidden rounded-xl border bg-white transition-all ${
              isEffExpired
                ? 'border-slate-200 opacity-50'
                : offer.status === 'accepted'
                ? 'border-emerald-500/20'
                : offer.status === 'rejected'
                ? 'border-slate-200 opacity-60'
                : isCountered
                ? 'border-orange-500/20'
                : 'border-slate-200'
            }`}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

            <div className="pl-5 pr-4 pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                <Badge text={CATEGORY_LABELS[req.category] ?? req.category} color={CATEGORY_BADGE[req.category]} />
                <Badge text={req.urgency} color={URGENCY_BADGE[req.urgency]} capitalize />
                <span
                  data-testid="my-offer-status-badge"
                  className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold ${OFFER_STATUS_BADGE[displayStatusKey] ?? OFFER_STATUS_BADGE.rejected}`}
                >
                  {statusLabel}
                </span>
              </div>

              <p className="text-[15px] font-semibold text-slate-900 leading-snug mb-2">{req.title}</p>

              {/* Note / description */}
              {(() => {
                const note = formatNote(req)
                return note ? (
                  <p className="text-[11px] text-slate-500 italic leading-relaxed mb-2 line-clamp-2">&ldquo;{note}&rdquo;</p>
                ) : null
              })()}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                {/* Where */}
                {(() => {
                  const where = formatWhere(req)
                  if (where) {
                    const isRideRoute = req.category === 'rides' && req.origin_city && req.destination_city
                    return isRideRoute ? (
                      <span className="flex items-center gap-1.5">
                        <span>🚗</span>
                        <span className="font-medium text-slate-700">{req.origin_city}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-medium text-slate-700">{req.destination_city}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span>{req.category === 'moving' ? '📦' : '📍'}</span>
                        <span>{where}</span>
                      </span>
                    )
                  }
                  return hasExpectedLocation(req.category) ? (
                    <span className="flex items-center gap-1.5 italic text-slate-400"><span>📍</span>Location not provided</span>
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
              {(() => {
                const when = formatWhen(req)
                const action = formatNextAction(offer.status, isEffExpired, req.status, when, isPastDue)
                if (action.variant === 'open') return null
                return <p className={`text-[11px] ${nextActionColor(action.variant)} mb-3`}>{action.label}</p>
              })()}

              {/* Your original offer */}
              {(offer.message || offer.counter_budget != null) && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-white/[0.02] px-3 py-2.5 space-y-1.5">
                  {offer.message && (
                    <p className="text-xs text-slate-400 italic">&ldquo;{offer.message}&rdquo;</p>
                  )}
                  {offer.counter_budget != null && (
                    <span className="inline-flex rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                      Your offer: ${offer.counter_budget}
                    </span>
                  )}
                </div>
              )}

              {/* Requester's counter */}
              {isCountered && offer.requester_counter != null && (
                <div className="mb-3 rounded-lg border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-orange-400 mb-1" data-testid="counter-label">{getCounterLabel(offerSubflow, req.is_driver)}</p>
                  <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-300">
                    ${offer.requester_counter}
                  </span>
                </div>
              )}

              {/* Accept / Decline counter (helper's one-time response) */}
              {isCountered && !isEffExpired && (
                <div className="mb-3 flex gap-2">
                  <button
                    data-testid="accept-counter-btn"
                    type="button"
                    onClick={() => acceptCounter(offer.id, req.id, req.requester_id)}
                    disabled={isActing}
                    className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {isActing ? '…' : 'Accept'}
                  </button>
                  <button
                    data-testid="decline-counter-btn"
                    type="button"
                    onClick={() => declineCounter(offer.id, req.id, req.requester_id)}
                    disabled={isActing}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                  >
                    {isActing ? '…' : 'Decline'}
                  </button>
                </div>
              )}

              {/* Passenger mark-complete — ride is past, accepted, not yet confirmed */}
              {offer.status === 'accepted' &&
                req.category === 'rides' && req.is_driver === true &&
                req.scheduled_time && new Date(req.scheduled_time) < now &&
                req.status !== 'completed' && (
                <div className="mb-3">
                  {offer.confirmed_completion ? (
                    <span className="text-xs font-semibold text-emerald-400">✓ You confirmed this ride</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markRideComplete(offer.id, req.id, req.requester_id)}
                      disabled={isActing}
                      className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                    >
                      {isActing ? '…' : 'Mark ride complete'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap border-t border-slate-200 pt-3">
                <Avatar name={profile?.name} />
                <span className="text-xs text-slate-500">
                  {req.category === 'rides' && req.is_driver ? 'Driver' : 'Posted by'}{' '}
                  <span className="text-slate-700">{profile?.name ?? 'A student'}</span>
                </span>
                {profile?.rating != null && (
                  <span className={`text-xs flex-shrink-0 ${Number(profile.rating) >= 4.5 ? 'text-yellow-400 font-medium' : 'text-slate-600'}`}>
                    ★ {Number(profile.rating).toFixed(1)}
                  </span>
                )}
                {repeatRequesterIds.has(req.requester_id) && (
                  <span className="flex-shrink-0 rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-1.5 py-0.5 text-[9px] font-semibold leading-none text-blue-400">
                    Regular
                  </span>
                )}
                <span className="ml-auto flex-shrink-0 text-xs text-slate-600">
                  Posted {formatPostedTime(req.created_at)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Offers modal (requester view) ───────────────────────────────────────────

function OffersModal({
  requestId,
  title,
  category,
  errandType,
  isDriver,
  availableSeats,
  seatsFilled,
  onClose,
  onAccepted,
}: {
  requestId: string
  title: string
  category: string
  errandType: string | null
  isDriver: boolean | null
  availableSeats: number | null
  seatsFilled: number | null
  onClose: () => void
  onAccepted: () => void
}) {
  const router = useRouter()
  const modalSubflow = subflowFromCategory(category, errandType)
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [localSeatsFilled, setLocalSeatsFilled] = useState(seatsFilled ?? 0)

  const hasAccepted = offers.some(o => o.status === 'accepted')
  const isMultiSeat = isDriver && availableSeats != null
  const allSeatsFilled = isMultiSeat && localSeatsFilled >= availableSeats!

  const fetchOffers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('request_offers')
      .select('id, helper_id, message, counter_budget, requester_counter, final_agreed_price, seats_requested, status, profiles!helper_id(name, rating)')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })

    if (error) {
      setFetchError(error.message)
    } else {
      setOffers((data ?? []) as OfferRow[])
    }
    setLoading(false)
  }, [requestId])

  useEffect(() => { fetchOffers() }, [fetchOffers])

  async function handleAccept(offerId: string) {
    setActing(offerId)
    setActionError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setActionError('Not authenticated'); setActing(null); return }

    const { data: result, error } = await supabase.rpc('accept_offer_atomic', {
      p_offer_id: offerId,
      p_accepted_by: user.id,
    })
    if (error || !result?.ok) {
      setActionError(error?.message ?? result?.error ?? 'Failed to accept offer')
      setActing(null)
      return
    }

    const helperOffer = offers.find(o => o.id === offerId)
    if (helperOffer) {
      await supabase.from('notifications').insert({
        user_id: helperOffer.helper_id,
        type: 'offer_accepted',
        message: getOfferNotificationMessage('offer_accepted', modalSubflow, { title }),
        related_request_id: requestId,
      })
      await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: helperOffer.helper_id,
        request_id: requestId,
        content: '✓ Offer accepted! Chat here to coordinate.',
      })
    }

    // Sync local seat count from authoritative DB response
    if (isMultiSeat && result.seats_filled != null) {
      setLocalSeatsFilled(result.seats_filled as number)
    }
    setOffers((prev) => prev.map((o) => o.id === offerId ? { ...o, status: 'accepted' as const } : o))
    setActing(null)
    if (!isMultiSeat) onAccepted()
    else router.refresh()
  }

  async function handleDecline(offerId: string) {
    setActing(offerId)
    setActionError(null)
    const supabase = createClient()
    const { data: check } = await supabase.rpc('validate_offer_action', { p_request_id: requestId })
    if (!check?.ok) { setActionError(check?.error ?? 'This request is no longer active'); setActing(null); return }
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offerId)
    if (error) { setActionError(error.message); setActing(null); return }

    const helperOffer = offers.find(o => o.id === offerId)
    if (helperOffer) {
      await supabase.from('notifications').insert({
        user_id: helperOffer.helper_id,
        type: 'offer_rejected',
        message: getOfferNotificationMessage('offer_declined', modalSubflow, { title }),
        related_request_id: requestId,
      })
    }

    setOffers((prev) => prev.map((o) => o.id === offerId ? { ...o, status: 'rejected' } : o))
    setActing(null)
  }

  async function handleCounter(offerId: string, amount: number | null) {
    setActing(offerId)
    setActionError(null)
    const supabase = createClient()
    const { data: check } = await supabase.rpc('validate_offer_action', { p_request_id: requestId })
    if (!check?.ok) { setActionError(check?.error ?? 'This request is no longer active'); setActing(null); return }
    const { error } = await supabase.from('request_offers')
      .update({ status: 'countered', requester_counter: amount })
      .eq('id', offerId)
    if (error) { setActionError(error.message); setActing(null); return }

    const helperOffer = offers.find(o => o.id === offerId)
    if (helperOffer) {
      await supabase.from('notifications').insert({
        user_id: helperOffer.helper_id,
        type: 'counter_offer',
        message: getOfferNotificationMessage('counter_sent', modalSubflow, { title, amount }),
        related_request_id: requestId,
      })
    }

    setOffers((prev) => prev.map((o) =>
      o.id === offerId ? { ...o, status: 'countered' as const, requester_counter: amount } : o
    ))
    setActing(null)
  }

  const pending = offers.filter((o) => o.status === 'pending' || o.status === 'countered')
  const resolved = offers.filter((o) => o.status === 'accepted' || o.status === 'rejected')

  return (
    <Modal onBackdropClick={onClose}>
      <ModalClose onClick={onClose} />
      <h3 className="pr-8 text-sm font-semibold text-white">Offers received</h3>
      <p className="mt-1 pr-8 text-xs text-slate-500 leading-relaxed">&ldquo;{title}&rdquo;</p>

      <div className="mt-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto -mx-6 px-6">
        {loading && <p className="py-6 text-center text-xs text-slate-500">Loading…</p>}
        {!loading && offers.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">No offers yet — check back soon.</p>
        )}
        {fetchError && <ErrorBox>{fetchError}</ErrorBox>}

        {pending.map((offer) => (
          <OfferRowCard
            key={offer.id}
            offer={offer}
            acting={acting}
            canAccept={isMultiSeat ? !allSeatsFilled : !hasAccepted}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onCounter={modalSubflow !== 'meal_meetup_request' ? handleCounter : undefined}
          />
        ))}

        {resolved.length > 0 && pending.length > 0 && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">resolved</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
        )}

        {resolved.map((offer) => (
          <OfferRowCard
            key={offer.id}
            offer={offer}
            acting={null}
            canAccept={false}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        ))}

        {actionError && <ErrorBox data-testid="modal-action-error">{actionError}</ErrorBox>}
      </div>
    </Modal>
  )
}

function OfferRowCard({
  offer,
  acting,
  canAccept,
  onAccept,
  onDecline,
  onCounter,
}: {
  offer: OfferRow
  acting: string | null
  canAccept: boolean
  onAccept: (id: string) => void
  onDecline: (id: string) => void
  onCounter?: (id: string, amount: number | null) => void
}) {
  const [showCounter, setShowCounter] = useState(false)
  const [counterAmt, setCounterAmt] = useState('')
  const [counterError, setCounterError] = useState<string | null>(null)
  const profile = normalizeProfile(offer.profiles)
  const isActing = acting === offer.id
  const isPending = offer.status === 'pending'
  const isCountered = offer.status === 'countered'
  const isResolved = offer.status === 'accepted' || offer.status === 'rejected'

  return (
    <div
      className={`rounded-xl border p-4 transition-opacity ${
        isResolved ? 'border-slate-200/50 opacity-55' : 'border-slate-200 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={profile?.name} size="sm" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-white">{profile?.name ?? 'Anonymous'}</span>
          {profile?.rating != null && (
            <span className="ml-2 text-xs text-slate-500">★ {Number(profile.rating).toFixed(1)}</span>
          )}
        </div>
        {offer.status === 'accepted' && (
          <span data-testid="offer-accepted-badge" className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            Accepted{(offer.final_agreed_price ?? offer.requester_counter ?? offer.counter_budget) != null ? ` · $${offer.final_agreed_price ?? offer.requester_counter ?? offer.counter_budget}` : ''}
          </span>
        )}
        {offer.status === 'rejected' && (
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            Declined
          </span>
        )}
        {isCountered && (
          <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
            Counter sent
          </span>
        )}
      </div>

      {offer.seats_requested != null && offer.seats_requested > 1 && (
        <p className="mt-1.5 text-[11px] text-slate-500">{offer.seats_requested} seats requested</p>
      )}
      {offer.message && (
        <p className="mt-2.5 text-xs text-slate-400 leading-relaxed">{offer.message}</p>
      )}
      {offer.counter_budget != null && (
        <div className="mt-2">
          <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
            Offered: ${offer.counter_budget}
          </span>
        </div>
      )}
      {isCountered && offer.requester_counter != null && (
        <div className="mt-2">
          <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
            Your counter: ${offer.requester_counter}
          </span>
        </div>
      )}

      {isPending && !showCounter && (
        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            data-testid="modal-accept-btn"
            type="button"
            onClick={() => onAccept(offer.id)}
            disabled={isActing || !canAccept}
            className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isActing ? '…' : 'Accept'}
          </button>
          <button
            data-testid="modal-decline-btn"
            type="button"
            onClick={() => onDecline(offer.id)}
            disabled={isActing}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            {isActing ? '…' : 'Decline'}
          </button>
          {onCounter && (
            <button
              data-testid="modal-counter-btn"
              type="button"
              onClick={() => setShowCounter(true)}
              disabled={isActing}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-orange-500/30 hover:text-orange-400 disabled:opacity-40"
            >
              Counter
            </button>
          )}
        </div>
      )}

      {showCounter && isPending && (
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">$</span>
            <input
              data-testid="modal-counter-input"
              type="number"
              min="0"
              step="0.01"
              value={counterAmt}
              onChange={e => setCounterAmt(e.target.value)}
              placeholder="Your price"
              disabled={isActing}
              className="w-full rounded-lg border border-slate-200 bg-white/[0.03] pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-orange-500/40 disabled:opacity-50"
            />
          </div>
          <button
            data-testid="modal-counter-send"
            type="button"
            onClick={() => {
              const err = validateOfferAmount(counterAmt)
              if (err) { setCounterError(err); return }
              setCounterError(null)
              onCounter?.(offer.id, counterAmt !== '' ? parseFloat(counterAmt) : null)
              setShowCounter(false)
            }}
            disabled={isActing}
            className="rounded-lg bg-orange-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-40"
          >
            {isActing ? '…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => { setShowCounter(false); setCounterAmt(''); setCounterError(null) }}
            disabled={isActing}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}
      {counterError && <p className="mt-1.5 text-[11px] text-red-400">{counterError}</p>}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: 'all' | 'mine' | 'offers' }) {
  const content = {
    all: {
      emoji: '📭',
      title: 'No open requests right now',
      sub: 'Be the first to post something. Rides, tutoring, errands, moving help, borrowing — anything campus-related.',
      cta: null,
    },
    mine: {
      emoji: '📝',
      title: 'You haven\'t posted a request yet',
      sub: 'Use the input above to describe what you need. Other verified students will respond with offers.',
      cta: 'Try: "Need a ride to Austin airport Friday at 6 AM — $25 budget"',
    },
    offers: {
      emoji: '🤝',
      title: 'You haven\'t offered help yet',
      sub: 'Switch to "All Open" to browse requests from students nearby. Click "I can help" on any request to send an offer.',
      cta: null,
    },
  }
  const c = content[tab]
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white/60 py-14 px-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl">
        {c.emoji}
      </div>
      <p className="text-sm font-medium text-slate-400">{c.title}</p>
      <p className="mt-1.5 max-w-xs text-xs text-slate-600 leading-relaxed">{c.sub}</p>
      {c.cta && (
        <p className="mt-3 max-w-xs rounded-lg border border-slate-200 bg-white/[0.02] px-4 py-2.5 text-xs text-slate-500 italic leading-relaxed">
          {c.cta}
        </p>
      )}
    </div>
  )
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Avatar({ name, size = 'md' }: { name?: string | null; size?: 'sm' | 'md' }) {
  const initials = name ? name[0].toUpperCase() : '?'
  const cls = size === 'sm'
    ? 'h-7 w-7 text-xs'
    : 'h-6 w-6 text-[11px]'
  return (
    <div className={`${cls} flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/40 to-blue-700/40 font-semibold text-blue-300`}>
      {initials}
    </div>
  )
}

function Badge({ text, color, capitalize }: { text: string; color?: string; capitalize?: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none ${capitalize ? 'capitalize' : ''} ${color ?? 'text-slate-400 bg-white/[0.03] border-slate-200'}`}>
      {text}
    </span>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 outline-none cursor-pointer appearance-none hover:border-blue-400/50 hover:text-slate-900 transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Modal({ children, onBackdropClick }: { children: React.ReactNode; onBackdropClick: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onBackdropClick} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-[#0a0f1e] p-6 shadow-2xl shadow-black/60">
        {children}
      </div>
    </div>
  )
}

function ModalClose({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300 disabled:opacity-40"
      aria-label="Close"
    >
      ✕
    </button>
  )
}

function ModalField({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
        {optional && <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-600">optional</span>}
      </label>
      {children}
    </div>
  )
}

function ErrorBox({ children, 'data-testid': testId }: { children: React.ReactNode; 'data-testid'?: string }) {
  return (
    <p data-testid={testId} className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-xs text-red-400">
      {children}
    </p>
  )
}

function OfferToast() {
  const [visible, setVisible] = useState(true)
  if (!visible) return null
  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 z-50 -translate-x-1/2 px-4 w-full max-w-sm">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-[#0a0f1e] px-5 py-3 shadow-xl shadow-black/60">
        <span className="text-emerald-400 text-sm">✓</span>
        <p className="text-sm text-white flex-1">Offer sent! The requester will be notified.</p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalizeProfile(p: ProfileInfo | ProfileInfo[] | null | undefined): ProfileInfo | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function StructuredDataMeta({ category, sd }: { category: string; sd: Record<string, unknown> | null | undefined }) {
  if (!sd) return null
  const chips: string[] = []

  if (category === 'moving') {
    // helpers_needed and location now in meta row — show access_type only
    const access = sd.access_type
    if (typeof access === 'string') {
      const accessLabels: Record<string, string> = { elevator: 'Elevator', stairs: 'Stairs', ground_floor: 'Ground floor' }
      chips.push(accessLabels[access] ?? (access.charAt(0).toUpperCase() + access.slice(1)))
    }
    if (sd.has_heavy_items === true) chips.push('Heavy items')
    if (sd.truck_needed === true) chips.push('Truck needed')
  } else if (category === 'peer_help') {
    // subject and is_virtual now in meta row — show help_type and session_type only
    const helpType = sd.help_type
    const helpTypeLabels: Record<string, string> = { homework: 'Homework', exam_prep: 'Exam prep', concept: 'Concept help', coding: 'Coding', proofreading: 'Proofreading', study_session: 'Study group' }
    if (typeof helpType === 'string') chips.push(helpTypeLabels[helpType] ?? helpType)
    if (sd.session_type === 'recurring') chips.push('Recurring')
  } else if (category === 'errands') {
    const type = sd.errand_type
    const typeLabels: Record<string, string> = { grocery: 'Grocery run', food_pickup: 'Food pickup', package: 'Package', delivery: 'Delivery', other: 'Errand' }
    if (typeof type === 'string') chips.push(typeLabels[type] ?? type)
    // store_or_place now in meta row — show task_details only
    const taskDetails = sd.task_details
    if (typeof taskDetails === 'string') chips.push(taskDetails.length > 25 ? taskDetails.slice(0, 25) + '…' : taskDetails)
  } else if (category === 'borrow') {
    // item and duration now in meta row — show return_condition
    const returnCond = sd.return_condition
    if (typeof returnCond === 'string') chips.push(returnCond.length > 30 ? returnCond.slice(0, 30) + '…' : returnCond)
  } else if (category === 'meal_meetup') {
    // restaurant_or_area now in meta row — show group_size and cuisine
    const cuisine = sd.cuisine_preference
    if (typeof cuisine === 'string') chips.push(cuisine)
    const size = sd.group_size
    if (size != null) chips.push(`${size} people`)
  }

  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
      {chips.slice(0, 3).map(c => (
        <span key={c} className="rounded-full border border-slate-200 bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-slate-400">
          {c}
        </span>
      ))}
    </div>
  )
}

function ExpandedStructuredData({ category, sd }: { category: string; sd: Record<string, unknown> }) {
  const rows: { label: string; value: string }[] = []

  if (category === 'rides') {
    const luggage = sd.has_luggage
    if (luggage === true) rows.push({ label: 'Luggage', value: 'Yes' })
    else if (luggage === false) rows.push({ label: 'Luggage', value: 'None' })
    const meetupPt = sd.meetup_point
    if (typeof meetupPt === 'string') rows.push({ label: 'Meet at', value: meetupPt })
    const stops = sd.stops_allowed
    if (stops === true) rows.push({ label: 'Stops', value: 'OK with stops' })
    else if (stops === false) rows.push({ label: 'Stops', value: 'Direct only' })
  } else if (category === 'moving') {
    const moveType = sd.move_type
    const moveLabels: Record<string, string> = { move_in: 'Moving in', move_out: 'Moving out', furniture: 'Moving furniture', other: 'Other' }
    if (typeof moveType === 'string') rows.push({ label: 'Type', value: moveLabels[moveType] ?? moveType })
    const helpers = sd.helpers_needed
    if (typeof helpers === 'number') rows.push({ label: 'Helpers', value: `${helpers} needed` })
    const access = sd.access_type
    const accessLabels: Record<string, string> = { elevator: 'Elevator access', stairs: 'Stairs only', ground_floor: 'Ground floor' }
    if (typeof access === 'string') rows.push({ label: 'Access', value: accessLabels[access] ?? access })
    if (sd.truck_needed === true) rows.push({ label: 'Needs', value: 'Truck or van' })
    if (sd.has_heavy_items === true) rows.push({ label: 'Items', value: 'Includes heavy items' })
    const dur = sd.estimated_duration
    if (typeof dur === 'string') rows.push({ label: 'Duration', value: dur })
  } else if (category === 'peer_help') {
    const subject = sd.subject
    if (typeof subject === 'string') rows.push({ label: 'Subject', value: subject })
    const helpType = sd.help_type
    const helpLabels: Record<string, string> = { homework: 'Homework help', exam_prep: 'Exam prep', concept: 'Concept explanation', coding: 'Coding help', proofreading: 'Proofreading', study_session: 'Study session' }
    if (typeof helpType === 'string') rows.push({ label: 'Format', value: helpLabels[helpType] ?? helpType })
    const isVirtual = sd.is_virtual
    if (isVirtual === true || isVirtual === 'true') rows.push({ label: 'Mode', value: 'Virtual / online' })
    else if (isVirtual === false || isVirtual === 'false') rows.push({ label: 'Mode', value: 'In-person' })
    if (sd.session_type === 'recurring') rows.push({ label: 'Frequency', value: 'Weekly / recurring' })
    else if (sd.session_type === 'one_time') rows.push({ label: 'Sessions', value: 'One-time' })
  } else if (category === 'errands') {
    const errandType = sd.errand_type
    const errandLabels: Record<string, string> = { grocery: 'Grocery run', food_pickup: 'Food pickup', pharmacy: 'Pharmacy', package: 'Package delivery', other: 'Other errand' }
    if (typeof errandType === 'string') rows.push({ label: 'Type', value: errandLabels[errandType] ?? errandType })
    const store = sd.store_or_place
    if (typeof store === 'string') rows.push({ label: 'From', value: store })
    const taskDetails = sd.task_details
    if (typeof taskDetails === 'string') rows.push({ label: 'Task', value: taskDetails })
    const reimburse = sd.reimbursement_type
    const reimburseLabels: Record<string, string> = { paid: "Requester pays you", reimburse: 'Costs reimbursed', free: 'Free favor' }
    if (typeof reimburse === 'string') rows.push({ label: 'Payment', value: reimburseLabels[reimburse] ?? reimburse })
  } else if (category === 'borrow') {
    const item = sd.item
    if (typeof item === 'string') rows.push({ label: 'Item', value: item })
    const duration = sd.duration
    if (typeof duration === 'string') rows.push({ label: 'Duration', value: duration })
    const returnCond = sd.return_condition
    if (typeof returnCond === 'string') rows.push({ label: 'Return', value: returnCond })
    if (sd.replacement_responsibility === true) rows.push({ label: 'Note', value: 'Will replace if damaged' })
  } else if (category === 'meal_meetup') {
    const cuisine = sd.cuisine_preference
    if (typeof cuisine === 'string') rows.push({ label: 'Cuisine', value: cuisine })
    const mealType = sd.meal_type
    const mealLabels: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', coffee: 'Coffee / study', other: 'Other' }
    if (typeof mealType === 'string') rows.push({ label: 'Meal', value: mealLabels[mealType] ?? mealType })
    const groupSize = sd.group_size
    if (typeof groupSize === 'number') rows.push({ label: 'Group', value: `Up to ${groupSize} people` })
    const costRange = sd.cost_range
    if (typeof costRange === 'string') rows.push({ label: 'Budget', value: costRange })
  }

  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-200/60">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-600 w-16 flex-shrink-0">{label}</span>
          <span className="text-xs text-slate-300">{value}</span>
        </div>
      ))}
    </div>
  )
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

const textareaClass =
  'w-full resize-none rounded-lg border border-slate-600 bg-white/[0.07] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-blue-500/50 focus:bg-white/[0.09] focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50'

const inputClass =
  'w-full rounded-lg border border-slate-600 bg-white/[0.07] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50'

const primaryBtn =
  'flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

const secondaryBtn =
  'rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-40'
