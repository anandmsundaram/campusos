'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
}

export interface OfferOnCard {
  id: string
  helper_id: string
  message: string | null
  counter_budget: number | null
  status: 'pending' | 'countered' | 'accepted' | 'rejected'
  profiles: ProfileInfo | ProfileInfo[] | null
  requester_counter: number | null
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
  created_at: string
  requests: RequestInfo | RequestInfo[] | null
  requester_counter: number | null
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
}

interface ProfileInfo {
  name: string | null
  rating: number | null
}

interface OfferRow {
  id: string
  helper_id: string
  message: string | null
  counter_budget: number | null
  status: 'pending' | 'countered' | 'accepted' | 'rejected'
  profiles: ProfileInfo | ProfileInfo[] | null
  requester_counter: number | null
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
}

interface OffersTarget {
  requestId: string
  title: string
  isDriver: boolean | null
  availableSeats: number | null
  seatsFilled: number | null
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
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  countered: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  accepted: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  rejected: 'text-slate-400 bg-white/[0.03] border-white/10',
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
    const { error } = await supabase.from('requests').update({ status: 'completed' }).eq('id', requestId)
    if (error) { setCompletingId(null); return }
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

  // Active = open (not yet past scheduled time) or matched; Past = completed or expired
  const activeMyRequests = useMemo(
    () => localMyRequests.filter(r =>
      (r.status === 'open' && (!r.scheduled_time || new Date(r.scheduled_time) >= now)) ||
      r.status === 'matched'
    ),
    [localMyRequests, now]
  )
  const pastMyRequests = useMemo(
    () => localMyRequests.filter(r =>
      r.status === 'completed' ||
      (r.status === 'open' && !!r.scheduled_time && new Date(r.scheduled_time) < now)
    ),
    [localMyRequests, now]
  )

  // View-offers modal (requester side)
  const [offersTarget, setOffersTarget] = useState<OffersTarget | null>(null)

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

  function openOfferModal(req: FeedRequest) {
    setOfferTarget({ requestId: req.id, title: req.title, budget: req.budget, category: req.category, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null })
    setOfferMessage('')
    setCounterBudget('')
    setSeatsRequested(1)
    setSubmitError(null)
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

    const parsedBudget = counterBudget !== '' ? parseFloat(counterBudget) : null
    const supabase = createClient()

    const isDriveRequest = offerTarget.category === 'rides' && offerTarget.isDriver === true
    const { error } = await supabase.from('request_offers').insert({
      request_id: offerTarget.requestId,
      helper_id: currentUserId,
      message: offerMessage.trim() || null,
      counter_budget: parsedBudget,
      seats_requested: isDriveRequest ? seatsRequested : 1,
      status: 'pending',
    })

    if (error) {
      setSubmitError(error.message)
      setSubmitting(false)
      return
    }

    // Notify the requester with ride-aware message
    const reqData = [...requests, ...localMyRequests].find(r => r.id === offerTarget.requestId)
    if (reqData?.requester_id) {
      const notifMsg = offerTarget.category === 'rides' && offerTarget.isDriver
        ? `New seat request for your ride "${offerTarget.title}"`
        : offerTarget.category === 'rides'
        ? `Someone offered a ride for "${offerTarget.title}"`
        : `You received a new offer on "${offerTarget.title}"`
      await supabase.from('notifications').insert({
        user_id: reqData.requester_id,
        type: 'offer_received',
        message: notifMsg,
        related_request_id: offerTarget.requestId,
      })
    }

    setOfferedIds((prev) => new Set(prev).add(offerTarget.requestId))
    setSubmitting(false)
    setOfferTarget(null)
    setOfferMessage('')
    setCounterBudget('')
    setSeatsRequested(1)
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e2d4a] mb-5">
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
                tab === t ? 'text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {labels[t]}
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                tab === t ? 'bg-blue-500/20 text-blue-400' : 'bg-white/[0.04] text-slate-600'
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
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                : 'border-[#1e2d4a] text-slate-500 hover:border-blue-500/20 hover:text-blue-400'
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
                        hasOffered={offeredIds.has(req.id)}
                        onOffer={() => openOfferModal(req)}
                        onViewOffers={() => setOffersTarget({ requestId: req.id, title: req.title, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null })}
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
                      />
                    )
                  })}
                </div>
              )}

              {filteredPastRequests.length > 0 && (
                <>
                  <div className="flex items-center gap-3 mt-6 mb-3">
                    <div className="flex-1 border-t border-[#1e2d4a]" />
                    <span className="text-[11px] text-slate-600 uppercase tracking-wider">Past</span>
                    <div className="flex-1 border-t border-[#1e2d4a]" />
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
                          hasOffered={false}
                          onOffer={() => {}}
                          onViewOffers={() => setOffersTarget({ requestId: req.id, title: req.title, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null })}
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
                hasOffered={offeredIds.has(req.id)}
                myOfferStatus={myOffersByRequestId.get(req.id)?.status ?? null}
                myOfferCounter={myOffersByRequestId.get(req.id)?.requester_counter ?? null}
                myOfferAgreedPrice={(() => { const o = myOffersByRequestId.get(req.id); return o ? (o.requester_counter ?? o.counter_budget) : null })()}
                myOfferSeats={myOffersByRequestId.get(req.id)?.seats_requested ?? 1}
                onGoToOffers={() => setTab('offers')}
                onOffer={() => openOfferModal(req)}
                onViewOffers={() => setOffersTarget({ requestId: req.id, title: req.title, isDriver: req.is_driver ?? null, availableSeats: req.available_seats ?? null, seatsFilled: req.seats_filled ?? null })}
                onOfferAccepted={(offerId, seatsToFill) => handleOfferAccepted(req.id, offerId, seatsToFill)}
                onOfferDeclined={(offerId) => handleOfferDeclined(req.id, offerId)}
              />
            )
          })}
        </div>
      )}

      {/* Offer / seat-request / ride-offer modal */}
      {offerTarget && (() => {
        const driverPostingSeats = offerTarget.category === 'rides' && offerTarget.isDriver === true
        const passengerNeedsRide = offerTarget.category === 'rides' && offerTarget.isDriver === false
        const modalTitle = driverPostingSeats ? 'Request a seat' : passengerNeedsRide ? 'Offer a ride' : 'Offer to help'
        const msgPlaceholder = driverPostingSeats
          ? 'e.g. I need 1 seat, happy to split gas…'
          : passengerNeedsRide
          ? 'e.g. I have a car and can pick you up…'
          : 'e.g. I\'m free Saturday morning and have a large car…'
        const priceLabelShown = !driverPostingSeats // driver sets the price; passenger just requests
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
                      className="h-8 w-8 rounded-lg border border-[#1e2d4a] text-slate-400 hover:border-blue-500/40 hover:text-white disabled:opacity-40 flex items-center justify-center text-lg leading-none">−</button>
                    <span className="text-sm font-semibold text-white w-4 text-center">{seatsRequested}</span>
                    <button type="button" onClick={() => setSeatsRequested(s => Math.min(seatsRemaining, s + 1))} disabled={submitting || seatsRequested >= seatsRemaining}
                      className="h-8 w-8 rounded-lg border border-[#1e2d4a] text-slate-400 hover:border-blue-500/40 hover:text-white disabled:opacity-40 flex items-center justify-center text-lg leading-none">+</button>
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

              {submitError && <ErrorBox>{submitError}</ErrorBox>}

              <div className="flex gap-3">
                <button type="submit" disabled={submitting} className={primaryBtn}>
                  {submitting ? 'Sending…' : modalTitle}
                </button>
                <button type="button" onClick={closeOfferModal} disabled={submitting} className={secondaryBtn}>
                  Cancel
                </button>
              </div>
            </form>
          </Modal>
        )
      })()}

      {/* View-offers modal (requester side) */}
      {offersTarget && (
        <OffersModal
          requestId={offersTarget.requestId}
          title={offersTarget.title}
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
    </>
  )
}

// ─── Request card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  profile,
  isOwn,
  hasOffered,
  myOfferStatus = null,
  myOfferCounter = null,
  myOfferAgreedPrice = null,
  myOfferSeats = 1,
  acceptedOffers,
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
}: {
  req: FeedRequest
  profile: ProfileInfo | null
  isOwn: boolean
  hasOffered: boolean
  myOfferStatus?: 'pending' | 'countered' | 'accepted' | 'rejected' | null
  myOfferCounter?: number | null
  myOfferAgreedPrice?: number | null
  myOfferSeats?: number
  acceptedOffers?: OfferOnCard[]
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
}) {
  const isRide = req.category === 'rides'
  const isFull = isRide && req.is_driver === true && req.available_seats != null && (req.seats_filled ?? 0) >= req.available_seats
  const rideStarted = isRide && (req.ride_started ?? false)
  const hasSeatsSold = isRide && req.is_driver === true &&
    ((req.seats_filled ?? 0) > 0 || (acceptedOffers && acceptedOffers.length > 0))
  const isExpired = isPast && req.status === 'open' && !hasSeatsSold
  const isPastRide = isPast && !!hasSeatsSold

  // Context-aware action label
  const ctaLabel = isRide
    ? (req.is_driver ? 'Request a seat' : 'Offer a ride')
    : 'I can help'
  const accentClass = isRide
    ? (req.is_driver ? 'bg-blue-500' : 'bg-purple-500')
    : (CATEGORY_ACCENT[req.category] ?? 'bg-slate-500')

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#1e2d4a] bg-[#0d1526] transition-all duration-200 hover:border-blue-500/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40">
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentClass}`} />

      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* Top: badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <Badge text={CATEGORY_LABELS[req.category] ?? req.category} color={CATEGORY_BADGE[req.category]} />
          <Badge text={req.urgency} color={URGENCY_BADGE[req.urgency]} capitalize />
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
              <Badge
                text={`${req.available_seats - (req.seats_filled ?? 0)} of ${req.available_seats} seats left`}
                color="text-slate-400 bg-white/[0.03] border-[#1e2d4a]"
              />
            )
          )}
          {isRide && req.is_round_trip && (
            <Badge text="Round trip" color="text-slate-400 bg-white/[0.03] border-[#1e2d4a]" />
          )}
          {isPastRide && req.status !== 'completed' && (
            <Badge text="Pending completion" color="text-yellow-400 bg-yellow-500/10 border-yellow-500/20" />
          )}
          {isExpired && (
            <Badge text="Expired" color="text-slate-500 bg-white/[0.02] border-[#1e2d4a]" />
          )}
          {req.status === 'completed' && (
            <Badge text="Completed" color="text-emerald-400 bg-emerald-500/10 border-emerald-500/20" />
          )}
        </div>

        {/* Title */}
        <p className="text-[15px] font-semibold text-white leading-snug mb-3">
          {req.title}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-4">
          {isRide && req.origin_city && req.destination_city ? (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">🚗</span>
              <span className="font-medium text-slate-300">{req.origin_city}</span>
              <span className="text-slate-600">→</span>
              <span className="font-medium text-slate-300">{req.destination_city}</span>
            </span>
          ) : req.location ? (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">📍</span>
              {req.location}
            </span>
          ) : null}
          {req.scheduled_time && (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">🕐</span>
              {req.flexible_time
                ? `${new Date(req.scheduled_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · Flexible`
                : new Date(req.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
          {req.budget != null && (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">💵</span>
              ${req.budget}{isRide && req.is_driver ? ' / seat' : ''}
            </span>
          )}
        </div>

        {/* Earnings summary — driver's own card with accepted seat bookings */}
        {isOwn && isRide && req.is_driver && acceptedOffers && acceptedOffers.length > 0 && (() => {
          const totalLocked = acceptedOffers.reduce((sum, o) => {
            const p = (o.requester_counter ?? o.counter_budget ?? req.budget) ?? 0
            return sum + p * (o.seats_requested ?? 1)
          }, 0)
          const seatsSold = acceptedOffers.reduce((sum, o) => sum + (o.seats_requested ?? 1), 0)
          const seatsOpen = (req.available_seats ?? 0) - seatsSold
          return (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.05] px-3 py-2 text-xs">
              <span className="font-semibold text-emerald-400">${totalLocked} locked in</span>
              <span className="text-slate-700">·</span>
              <span className="text-slate-500">{seatsSold} seat{seatsSold !== 1 ? 's' : ''} sold</span>
              {seatsOpen > 0 && (
                <>
                  <span className="text-slate-700">·</span>
                  <span className="text-slate-500">{seatsOpen} open @ ${req.budget}</span>
                </>
              )}
            </div>
          )
        })()}

        {/* Inline pending offers — shown in My Requests tab for the requester */}
        {inlineOffers.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {inlineOffers.length} pending offer{inlineOffers.length !== 1 ? 's' : ''}
            </p>
            {inlineOffers.map(offer => (
              <InlineOfferRow
                key={offer.id}
                offer={offer}
                requestId={req.id}
                isDriver={req.is_driver}
                availableSeats={req.available_seats}
                seatsFilled={req.seats_filled}
                onAccepted={() => onOfferAccepted?.(offer.id, offer.seats_requested ?? 1)}
                onDeclined={() => onOfferDeclined?.(offer.id)}
                onCountered={(id, amount) => onOfferCountered?.(id, amount)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#1e2d4a] pt-3">
          <div className="flex items-center gap-2">
            <Avatar name={profile?.name} />
            <span className="text-xs text-slate-400 font-medium">
              {profile?.name ?? 'Anonymous'}
            </span>
            {profile?.rating != null && (
              <span className="text-xs text-slate-600">
                ★ {Number(profile.rating).toFixed(1)}
              </span>
            )}
            <span className="text-xs text-slate-700">·</span>
            <span className="text-xs text-slate-600">{timeAgo(req.created_at)}</span>
          </div>

          {isPast ? (
            req.status === 'completed'
              ? <span className="text-xs font-semibold text-emerald-400">Completed ✓</span>
              : isPastRide && onComplete
              ? (
                <button
                  type="button"
                  onClick={onComplete}
                  disabled={completing}
                  className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                >
                  {completing ? '…' : 'Mark complete'}
                </button>
              )
              : <span className="text-xs text-slate-500">Expired</span>
          ) : isOwn ? (
            <button
              type="button"
              onClick={onViewOffers}
              className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-white/20 hover:text-slate-200"
            >
              View offers
            </button>
          ) : (hasOffered || myOfferStatus) ? (
            myOfferStatus === 'countered' ? (
              <button
                type="button"
                onClick={onGoToOffers}
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
              type="button"
              onClick={onOffer}
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
  isDriver,
  availableSeats,
  seatsFilled,
  onAccepted,
  onDeclined,
  onCountered,
}: {
  offer: OfferOnCard
  requestId: string
  isDriver: boolean | null
  availableSeats: number | null
  seatsFilled: number | null
  onAccepted: () => void
  onDeclined: () => void
  onCountered?: (offerId: string, amount: number | null) => void
}) {
  const [acting, setActing] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [showCounter, setShowCounter] = useState(false)
  const [counterAmt, setCounterAmt] = useState('')
  const profile = normalizeProfile(offer.profiles)

  async function accept() {
    setActing(true)
    setRowError(null)
    const supabase = createClient()
    const { error: e1 } = await supabase.from('request_offers').update({ status: 'accepted' }).eq('id', offer.id)
    if (e1) { setRowError(e1.message); setActing(false); return }
    const isMultiSeat = isDriver && availableSeats != null
    if (isMultiSeat) {
      const seatsToFill = offer.seats_requested ?? 1
      const newFilled = (seatsFilled ?? 0) + seatsToFill
      const newStatus = newFilled >= availableSeats! ? 'matched' : 'open'
      const { error: e2 } = await supabase.from('requests').update({ seats_filled: newFilled, status: newStatus }).eq('id', requestId)
      if (e2) { setRowError(e2.message); setActing(false); return }
    } else {
      const { error: e2 } = await supabase.from('requests').update({ status: 'matched' }).eq('id', requestId)
      if (e2) { setRowError(e2.message); setActing(false); return }
    }
    await supabase.from('notifications').insert({
      user_id: offer.helper_id,
      type: 'offer_accepted',
      message: 'Your offer was accepted!',
      related_request_id: requestId,
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: offer.helper_id,
        request_id: requestId,
        content: '✓ Offer accepted! Chat here to coordinate.',
      })
    }
    setActing(false)
    onAccepted()
  }

  async function decline() {
    setActing(true)
    setRowError(null)
    const supabase = createClient()
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offer.id)
    if (error) { setRowError(error.message); setActing(false); return }
    await supabase.from('notifications').insert({
      user_id: offer.helper_id,
      type: 'offer_rejected',
      message: 'Your offer was declined.',
      related_request_id: requestId,
    })
    setActing(false)
    onDeclined()
  }

  async function submitCounter() {
    setActing(true)
    setRowError(null)
    const supabase = createClient()
    const amt = counterAmt !== '' ? parseFloat(counterAmt) : null
    const { error } = await supabase.from('request_offers')
      .update({ status: 'countered', requester_counter: amt })
      .eq('id', offer.id)
    if (error) { setRowError(error.message); setActing(false); return }
    await supabase.from('notifications').insert({
      user_id: offer.helper_id,
      type: 'counter_offer',
      message: `Counter-offer received${amt != null ? ` — $${amt}` : ''}`,
      related_request_id: requestId,
    })
    setActing(false)
    setShowCounter(false)
    onCountered?.(offer.id, amt)
  }

  const isCountered = offer.status === 'countered'

  return (
    <div className="rounded-lg border border-[#1e2d4a] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={profile?.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-white">{profile?.name ?? 'Anonymous'}</span>
            {profile?.rating != null && (
              <span className="text-xs text-slate-600">★ {Number(profile.rating).toFixed(1)}</span>
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
        {isCountered ? (
          <span className="text-[11px] text-orange-400 flex-shrink-0">Counter sent ✓</span>
        ) : (
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={accept}
              disabled={acting}
              className="rounded-lg bg-emerald-600/80 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              {acting ? '…' : 'Accept'}
            </button>
            <button
              type="button"
              onClick={decline}
              disabled={acting}
              className="rounded-lg border border-[#1e2d4a] px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
            >
              {acting ? '…' : 'Decline'}
            </button>
            <button
              type="button"
              onClick={() => setShowCounter(v => !v)}
              disabled={acting}
              className="rounded-lg border border-[#1e2d4a] px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-orange-500/30 hover:text-orange-400 disabled:opacity-40"
            >
              Counter
            </button>
          </div>
        )}
      </div>

      {showCounter && !isCountered && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={counterAmt}
              onChange={e => setCounterAmt(e.target.value)}
              placeholder="Your price"
              disabled={acting}
              className="w-full rounded-lg border border-[#1e2d4a] bg-white/[0.03] pl-6 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-orange-500/40 disabled:opacity-50"
            />
          </div>
          <button
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
            className="rounded-lg border border-[#1e2d4a] px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}

      {rowError && <p className="mt-1.5 text-[11px] text-red-400">{rowError}</p>}
    </div>
  )
}

// ─── My Offers tab ────────────────────────────────────────────────────────────

function MyOffersTab({ offers: initialOffers, currentUserId }: { offers: MyOffer[]; currentUserId: string }) {
  const router = useRouter()
  const [offers, setOffers] = useState<MyOffer[]>(initialOffers)
  const [acting, setActing] = useState<string | null>(null)
  const [actError, setActError] = useState<string | null>(null)

  async function acceptCounter(offerId: string, requestId: string, requesterId: string, req: RequestInfo | null) {
    setActing(offerId)
    setActError(null)
    const supabase = createClient()
    const { error: e1 } = await supabase.from('request_offers').update({ status: 'accepted' }).eq('id', offerId)
    if (e1) { setActError(e1.message); setActing(null); return }
    const isMultiSeat = req?.is_driver && req?.available_seats != null
    if (isMultiSeat) {
      const offerRow = offers.find(o => o.id === offerId)
      const seatsToFill = offerRow?.seats_requested ?? 1
      const newFilled = (req!.seats_filled ?? 0) + seatsToFill
      const newStatus = newFilled >= req!.available_seats! ? 'matched' : 'open'
      const { error: e2 } = await supabase.from('requests').update({ seats_filled: newFilled, status: newStatus }).eq('id', requestId)
      if (e2) { setActError(e2.message); setActing(null); return }
    } else {
      const { error: e2 } = await supabase.from('requests').update({ status: 'matched' }).eq('id', requestId)
      if (e2) { setActError(e2.message); setActing(null); return }
    }
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'offer_accepted',
      message: 'Your counter-offer was accepted!',
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
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offerId)
    if (error) { setActError(error.message); setActing(null); return }
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'offer_rejected',
      message: 'Your counter-offer was declined.',
      related_request_id: requestId,
    })
    setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'rejected' as const } : o))
    setActing(null)
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[#1e2d4a] bg-[#0d1526]/60 py-16 text-center">
        <p className="text-sm font-medium text-slate-400">No offers yet</p>
        <p className="mt-1 text-xs text-slate-600">
          Browse requests and click &ldquo;I can help&rdquo; to send an offer
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

        const agreedPrice = offer.requester_counter ?? offer.counter_budget
        const seats = offer.seats_requested ?? 1
        const statusLabel =
          offer.status === 'pending' ? '● Pending'
          : offer.status === 'countered' ? '↩ Counter received'
          : offer.status === 'accepted'
            ? `✓ Accepted${agreedPrice != null ? ` · ${seats > 1 ? `${seats}× ` : ''}$${agreedPrice}` : ''}`
          : 'Declined'

        return (
          <div
            key={offer.id}
            className={`relative overflow-hidden rounded-xl border bg-[#0d1526] transition-all ${
              offer.status === 'accepted'
                ? 'border-emerald-500/20'
                : offer.status === 'rejected'
                ? 'border-[#1e2d4a] opacity-60'
                : isCountered
                ? 'border-orange-500/20'
                : 'border-[#1e2d4a]'
            }`}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

            <div className="pl-5 pr-4 pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                <Badge text={CATEGORY_LABELS[req.category] ?? req.category} color={CATEGORY_BADGE[req.category]} />
                <Badge text={req.urgency} color={URGENCY_BADGE[req.urgency]} capitalize />
                <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold ${OFFER_STATUS_BADGE[offer.status]}`}>
                  {statusLabel}
                </span>
              </div>

              <p className="text-[15px] font-semibold text-white leading-snug mb-3">{req.title}</p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                {req.location && <span className="flex items-center gap-1.5"><span>📍</span>{req.location}</span>}
                {req.scheduled_time && (
                  <span className="flex items-center gap-1.5">
                    <span>🕐</span>
                    {new Date(req.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                )}
                {req.budget != null && <span className="flex items-center gap-1.5"><span>💵</span>${req.budget}</span>}
              </div>

              {/* Your original offer */}
              {(offer.message || offer.counter_budget != null) && (
                <div className="mb-3 rounded-lg border border-[#1e2d4a] bg-white/[0.02] px-3 py-2.5 space-y-1.5">
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
                  <p className="text-[11px] font-medium text-orange-400 mb-1">Counter-offer from requester</p>
                  <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-300">
                    ${offer.requester_counter}
                  </span>
                </div>
              )}

              {/* Accept / Decline counter (helper's one-time response) */}
              {isCountered && (
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => acceptCounter(offer.id, req.id, req.requester_id, req)}
                    disabled={isActing}
                    className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {isActing ? '…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    onClick={() => declineCounter(offer.id, req.id, req.requester_id)}
                    disabled={isActing}
                    className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                  >
                    {isActing ? '…' : 'Decline'}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-[#1e2d4a] pt-3">
                <Avatar name={profile?.name} />
                <span className="text-xs text-slate-500">
                  Requested by <span className="text-slate-300">{profile?.name ?? 'Anonymous'}</span>
                </span>
                {profile?.rating != null && (
                  <span className="text-xs text-slate-600">★ {Number(profile.rating).toFixed(1)}</span>
                )}
                <span className="ml-auto text-xs text-slate-600">{timeAgo(offer.created_at)}</span>
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
  isDriver,
  availableSeats,
  seatsFilled,
  onClose,
  onAccepted,
}: {
  requestId: string
  title: string
  isDriver: boolean | null
  availableSeats: number | null
  seatsFilled: number | null
  onClose: () => void
  onAccepted: () => void
}) {
  const router = useRouter()
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
      .select('id, helper_id, message, counter_budget, requester_counter, seats_requested, status, profiles(name, rating)')
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

    const { error: e1 } = await supabase.from('request_offers').update({ status: 'accepted' }).eq('id', offerId)
    if (e1) { setActionError(e1.message); setActing(null); return }

    const helperOffer = offers.find(o => o.id === offerId)
    const seatsToFill = helperOffer?.seats_requested ?? 1
    if (isMultiSeat) {
      const newFilled = localSeatsFilled + seatsToFill
      const newStatus = newFilled >= availableSeats! ? 'matched' : 'open'
      const { error: e2 } = await supabase.from('requests').update({ seats_filled: newFilled, status: newStatus }).eq('id', requestId)
      if (e2) { setActionError(e2.message); setActing(null); return }
      setLocalSeatsFilled(newFilled)
    } else {
      const { error: e2 } = await supabase.from('requests').update({ status: 'matched' }).eq('id', requestId)
      if (e2) { setActionError(e2.message); setActing(null); return }
    }

    if (helperOffer) {
      await supabase.from('notifications').insert({
        user_id: helperOffer.helper_id,
        type: 'offer_accepted',
        message: `Your offer was accepted for "${title}"`,
        related_request_id: requestId,
      })
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('messages').insert({
          sender_id: user.id,
          receiver_id: helperOffer.helper_id,
          request_id: requestId,
          content: '✓ Offer accepted! Chat here to coordinate.',
        })
      }
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
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offerId)
    if (error) { setActionError(error.message); setActing(null); return }

    const helperOffer = offers.find(o => o.id === offerId)
    if (helperOffer) {
      await supabase.from('notifications').insert({
        user_id: helperOffer.helper_id,
        type: 'offer_rejected',
        message: `Your offer was declined for "${title}"`,
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
    const { error } = await supabase.from('request_offers')
      .update({ status: 'countered', requester_counter: amount })
      .eq('id', offerId)
    if (error) { setActionError(error.message); setActing(null); return }

    const helperOffer = offers.find(o => o.id === offerId)
    if (helperOffer) {
      await supabase.from('notifications').insert({
        user_id: helperOffer.helper_id,
        type: 'counter_offer',
        message: `Counter-offer received for "${title}"${amount != null ? ` — $${amount}` : ''}`,
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
            onCounter={handleCounter}
          />
        ))}

        {resolved.length > 0 && pending.length > 0 && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 border-t border-[#1e2d4a]" />
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">resolved</span>
            <div className="flex-1 border-t border-[#1e2d4a]" />
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

        {actionError && <ErrorBox>{actionError}</ErrorBox>}
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
  const profile = normalizeProfile(offer.profiles)
  const isActing = acting === offer.id
  const isPending = offer.status === 'pending'
  const isCountered = offer.status === 'countered'
  const isResolved = offer.status === 'accepted' || offer.status === 'rejected'

  return (
    <div
      className={`rounded-xl border p-4 transition-opacity ${
        isResolved ? 'border-[#1e2d4a]/50 opacity-55' : 'border-[#1e2d4a] bg-white/[0.02]'
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
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            Accepted{(offer.requester_counter ?? offer.counter_budget) != null ? ` · $${offer.requester_counter ?? offer.counter_budget}` : ''}
          </span>
        )}
        {offer.status === 'rejected' && (
          <span className="rounded-full border border-[#1e2d4a] px-2 py-0.5 text-[10px] font-medium text-slate-500">
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
            type="button"
            onClick={() => onAccept(offer.id)}
            disabled={isActing || !canAccept}
            className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isActing ? '…' : 'Accept'}
          </button>
          <button
            type="button"
            onClick={() => onDecline(offer.id)}
            disabled={isActing}
            className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            {isActing ? '…' : 'Decline'}
          </button>
          {onCounter && (
            <button
              type="button"
              onClick={() => setShowCounter(true)}
              disabled={isActing}
              className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-orange-500/30 hover:text-orange-400 disabled:opacity-40"
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
              type="number"
              min="0"
              step="0.01"
              value={counterAmt}
              onChange={e => setCounterAmt(e.target.value)}
              placeholder="Your price"
              disabled={isActing}
              className="w-full rounded-lg border border-[#1e2d4a] bg-white/[0.03] pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-orange-500/40 disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={() => { onCounter?.(offer.id, counterAmt !== '' ? parseFloat(counterAmt) : null); setShowCounter(false) }}
            disabled={isActing}
            className="rounded-lg bg-orange-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-40"
          >
            {isActing ? '…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => { setShowCounter(false); setCounterAmt('') }}
            disabled={isActing}
            className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: 'all' | 'mine' | 'offers' }) {
  const messages = {
    all: { emoji: '📭', title: 'No open requests', sub: 'Be the first to post something in your campus' },
    mine: { emoji: '📝', title: 'No requests yet', sub: 'Use the input above to post your first request' },
    offers: { emoji: '🤝', title: 'No offers yet', sub: 'Browse open requests and click "I can help"' },
  }
  const m = messages[tab]
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#1e2d4a] bg-[#0d1526]/60 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#1e2d4a] bg-[#0d1526] text-2xl">
        {m.emoji}
      </div>
      <p className="text-sm font-medium text-slate-400">{m.title}</p>
      <p className="mt-1 text-xs text-slate-600">{m.sub}</p>
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
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none ${capitalize ? 'capitalize' : ''} ${color ?? 'text-slate-400 bg-white/[0.03] border-[#1e2d4a]'}`}>
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
      className="rounded-lg border border-[#1e2d4a] bg-[#0d1526] px-3 py-1.5 text-xs text-slate-400 outline-none cursor-pointer appearance-none hover:border-blue-500/30 hover:text-slate-200 transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#0d1526]">
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
      <div className="relative w-full max-w-md rounded-2xl border border-[#1e2d4a] bg-[#0a0f1e] p-6 shadow-2xl shadow-black/60">
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

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-xs text-red-400">
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
  'w-full resize-none rounded-lg border border-[#1e2d4a] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:border-blue-500/50 focus:bg-white/[0.05] focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50'

const inputClass =
  'w-full rounded-lg border border-[#1e2d4a] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50'

const primaryBtn =
  'flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

const secondaryBtn =
  'rounded-lg border border-[#1e2d4a] px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40'
