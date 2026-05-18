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
  location: string | null
  budget: number | null
  scheduled_time: string | null
  created_at: string
  requester_id: string
  profiles: ProfileInfo | ProfileInfo[] | null
}

export interface MyOffer {
  id: string
  message: string | null
  counter_budget: number | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  requests: RequestInfo | RequestInfo[] | null
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
  status: 'pending' | 'accepted' | 'rejected'
  profiles: ProfileInfo | ProfileInfo[] | null
}

interface OfferTarget {
  requestId: string
  title: string
  budget: number | null
}

interface OffersTarget {
  requestId: string
  title: string
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
  accepted: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  rejected: 'text-slate-400 bg-white/[0.03] border-white/10',
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  requests: FeedRequest[]
  myOffers: MyOffer[]
  currentUserId: string
}

export default function RequestFeed({ requests, myOffers, currentUserId }: Props) {
  const router = useRouter()

  // Tab
  const [tab, setTab] = useState<'all' | 'mine' | 'offers'>('all')

  // Filters
  const [catFilter, setCatFilter] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Offer submission state ("I can help" modal)
  const [offerTarget, setOfferTarget] = useState<OfferTarget | null>(null)
  const [offerMessage, setOfferMessage] = useState('')
  const [counterBudget, setCounterBudget] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set())

  // View-offers modal (requester side)
  const [offersTarget, setOffersTarget] = useState<OffersTarget | null>(null)

  // Derived request lists
  const filteredRequests = useMemo(() => {
    let items = tab === 'mine'
      ? requests.filter((r) => r.requester_id === currentUserId)
      : requests

    if (catFilter !== 'all') items = items.filter((r) => r.category === catFilter)
    if (urgencyFilter !== 'all') items = items.filter((r) => r.urgency === urgencyFilter)

    if (sortBy === 'budget_high') {
      items = [...items].sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1))
    } else if (sortBy === 'budget_low') {
      items = [...items].sort((a, b) => (a.budget ?? Infinity) - (b.budget ?? Infinity))
    }

    return items
  }, [tab, requests, currentUserId, catFilter, urgencyFilter, sortBy])

  function openOfferModal(req: FeedRequest) {
    setOfferTarget({ requestId: req.id, title: req.title, budget: req.budget })
    setOfferMessage('')
    setCounterBudget('')
    setSubmitError(null)
  }

  function closeOfferModal() {
    if (submitting) return
    setOfferTarget(null)
    setOfferMessage('')
    setCounterBudget('')
    setSubmitError(null)
  }

  async function handleSubmitOffer(e: React.FormEvent) {
    e.preventDefault()
    if (!offerTarget || submitting) return
    setSubmitError(null)
    setSubmitting(true)

    const parsedBudget = counterBudget !== '' ? parseFloat(counterBudget) : null
    const supabase = createClient()

    const { error } = await supabase.from('request_offers').insert({
      request_id: offerTarget.requestId,
      helper_id: currentUserId,
      message: offerMessage.trim() || null,
      counter_budget: parsedBudget,
      status: 'pending',
    })

    if (error) {
      setSubmitError(error.message)
      setSubmitting(false)
      return
    }

    setOfferedIds((prev) => new Set(prev).add(offerTarget.requestId))
    setSubmitting(false)
    setOfferTarget(null)
    setOfferMessage('')
    setCounterBudget('')
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e2d4a] mb-5">
        {(['all', 'mine', 'offers'] as const).map((t) => {
          const labels = { all: 'All Open', mine: 'My Requests', offers: 'My Offers' }
          const counts = {
            all: requests.filter((r) => r.requester_id !== currentUserId).length + requests.filter((r) => r.requester_id === currentUserId).length,
            mine: requests.filter((r) => r.requester_id === currentUserId).length,
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
        <MyOffersTab offers={myOffers} />
      ) : filteredRequests.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRequests.map((req) => {
            const profile = normalizeProfile(req.profiles)
            const isOwn = req.requester_id === currentUserId
            const hasOffered = offeredIds.has(req.id)

            return (
              <RequestCard
                key={req.id}
                req={req}
                profile={profile}
                isOwn={isOwn}
                hasOffered={hasOffered}
                onOffer={() => openOfferModal(req)}
                onViewOffers={() => setOffersTarget({ requestId: req.id, title: req.title })}
              />
            )
          })}
        </div>
      )}

      {/* "I can help" modal */}
      {offerTarget && (
        <Modal onBackdropClick={closeOfferModal}>
          <ModalClose onClick={closeOfferModal} disabled={submitting} />
          <h3 className="pr-8 text-sm font-semibold text-white">Offer to help</h3>
          <p className="mt-1 pr-8 text-xs text-slate-500 leading-relaxed">
            &ldquo;{offerTarget.title}&rdquo;
          </p>

          <form onSubmit={handleSubmitOffer} className="mt-5 flex flex-col gap-4">
            <ModalField label="Message to requester" optional>
              <textarea
                rows={3}
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                placeholder="e.g. I'm free Saturday morning and have a large car…"
                disabled={submitting}
                className={textareaClass}
              />
            </ModalField>

            <ModalField label="Propose a different price" optional>
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

            {submitError && <ErrorBox>{submitError}</ErrorBox>}

            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className={primaryBtn}>
                {submitting ? 'Sending…' : 'Send offer'}
              </button>
              <button type="button" onClick={closeOfferModal} disabled={submitting} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* View-offers modal (requester side) */}
      {offersTarget && (
        <OffersModal
          requestId={offersTarget.requestId}
          title={offersTarget.title}
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
  onOffer,
  onViewOffers,
}: {
  req: FeedRequest
  profile: ProfileInfo | null
  isOwn: boolean
  hasOffered: boolean
  onOffer: () => void
  onViewOffers: () => void
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#1e2d4a] bg-[#0d1526] transition-all duration-200 hover:border-blue-500/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40">
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* Top: badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <Badge text={CATEGORY_LABELS[req.category] ?? req.category} color={CATEGORY_BADGE[req.category]} />
          <Badge text={req.urgency} color={URGENCY_BADGE[req.urgency]} capitalize />
        </div>

        {/* Title */}
        <p className="text-[15px] font-semibold text-white leading-snug mb-3">
          {req.title}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-4">
          {req.location && (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">📍</span>
              {req.location}
            </span>
          )}
          {req.scheduled_time && (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">🕐</span>
              {new Date(req.scheduled_time).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          )}
          {req.budget != null && (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px]">💵</span>
              ${req.budget}
            </span>
          )}
        </div>

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

          {isOwn ? (
            <button
              type="button"
              onClick={onViewOffers}
              className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-white/20 hover:text-slate-200"
            >
              View offers
            </button>
          ) : hasOffered ? (
            <span className="text-xs font-semibold text-emerald-400">Offer sent ✓</span>
          ) : (
            <button
              type="button"
              onClick={onOffer}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-blue-500 active:scale-95"
            >
              I can help
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── My Offers tab ────────────────────────────────────────────────────────────

function MyOffersTab({ offers }: { offers: MyOffer[] }) {
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
      {offers.map((offer) => {
        const req = Array.isArray(offer.requests) ? offer.requests[0] : offer.requests
        if (!req) return null
        const profile = normalizeProfile(req.profiles)

        return (
          <div
            key={offer.id}
            className={`relative overflow-hidden rounded-xl border bg-[#0d1526] transition-all ${
              offer.status === 'accepted'
                ? 'border-emerald-500/20'
                : offer.status === 'rejected'
                ? 'border-[#1e2d4a] opacity-60'
                : 'border-[#1e2d4a]'
            }`}
          >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

            <div className="pl-5 pr-4 pt-4 pb-4">
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                <Badge text={CATEGORY_LABELS[req.category] ?? req.category} color={CATEGORY_BADGE[req.category]} />
                <Badge text={req.urgency} color={URGENCY_BADGE[req.urgency]} capitalize />
                <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${OFFER_STATUS_BADGE[offer.status]}`}>
                  {offer.status === 'pending' ? '● Pending' : offer.status === 'accepted' ? '✓ Accepted' : 'Declined'}
                </span>
              </div>

              {/* Title */}
              <p className="text-[15px] font-semibold text-white leading-snug mb-3">{req.title}</p>

              {/* Request meta */}
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

              {/* Your offer details */}
              {(offer.message || offer.counter_budget != null) && (
                <div className="mb-3 rounded-lg border border-[#1e2d4a] bg-white/[0.02] px-3 py-2.5 space-y-1.5">
                  {offer.message && (
                    <p className="text-xs text-slate-400 italic">&ldquo;{offer.message}&rdquo;</p>
                  )}
                  {offer.counter_budget != null && (
                    <span className="inline-flex rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                      Offered: ${offer.counter_budget}
                    </span>
                  )}
                </div>
              )}

              {/* Footer */}
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
  onClose,
  onAccepted,
}: {
  requestId: string
  title: string
  onClose: () => void
  onAccepted: () => void
}) {
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [hasAccepted, setHasAccepted] = useState(false)

  const fetchOffers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('request_offers')
      .select('id, helper_id, message, counter_budget, status, profiles(name, rating)')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })

    if (error) {
      setFetchError(error.message)
    } else {
      setOffers((data ?? []) as OfferRow[])
      setHasAccepted((data ?? []).some((o) => o.status === 'accepted'))
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

    const { error: e2 } = await supabase.from('requests').update({ status: 'matched' }).eq('id', requestId)
    if (e2) { setActionError(e2.message); setActing(null); return }

    setOffers((prev) => prev.map((o) => o.id === offerId ? { ...o, status: 'accepted' } : o))
    setHasAccepted(true)
    setActing(null)
    onAccepted()
  }

  async function handleDecline(offerId: string) {
    setActing(offerId)
    setActionError(null)
    const supabase = createClient()
    const { error } = await supabase.from('request_offers').update({ status: 'rejected' }).eq('id', offerId)
    if (error) { setActionError(error.message); setActing(null); return }
    setOffers((prev) => prev.map((o) => o.id === offerId ? { ...o, status: 'rejected' } : o))
    setActing(null)
  }

  const pending = offers.filter((o) => o.status === 'pending')
  const resolved = offers.filter((o) => o.status !== 'pending')

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
            canAccept={!hasAccepted}
            onAccept={handleAccept}
            onDecline={handleDecline}
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
}: {
  offer: OfferRow
  acting: string | null
  canAccept: boolean
  onAccept: (id: string) => void
  onDecline: (id: string) => void
}) {
  const profile = normalizeProfile(offer.profiles)
  const isActing = acting === offer.id
  const isPending = offer.status === 'pending'

  return (
    <div
      className={`rounded-xl border p-4 transition-opacity ${
        isPending ? 'border-[#1e2d4a] bg-white/[0.02]' : 'border-[#1e2d4a]/50 opacity-55'
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
            Accepted
          </span>
        )}
        {offer.status === 'rejected' && (
          <span className="rounded-full border border-[#1e2d4a] px-2 py-0.5 text-[10px] font-medium text-slate-500">
            Declined
          </span>
        )}
      </div>

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

      {isPending && (
        <div className="mt-3 flex gap-2">
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onBackdropClick} />
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
