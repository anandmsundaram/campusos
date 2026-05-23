'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { subflowFromCategory, getCounterLabel, getStatusLabel } from '@/lib/offerText'

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
  is_driver: boolean | null
  structured_data: Record<string, unknown> | null
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
  pending:  { label: '● Pending',      cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  accepted: { label: '✓ Accepted',     cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  rejected: { label: 'Declined',       cls: 'text-slate-500 bg-white/[0.03] border-white/10' },
  countered: { label: '↔ Countered',   cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
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
  const [offers, setOffers] = useState<MyOffer[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: offersData } = await supabase
      .from('request_offers')
      .select(`
        id, message, counter_budget, requester_counter, final_agreed_price, seats_requested, status, created_at,
        requests(id, title, category, urgency, status, budget, location, origin_city, destination_city, scheduled_time, created_at, is_driver, structured_data, profiles!requester_id(name, rating))
      `)
      .eq('helper_id', user.id)
      .order('created_at', { ascending: false })

    setOffers((offersData as MyOffer[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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
        <h1 className="text-2xl font-bold text-white">My Offers</h1>
        <p className="mt-1 text-sm text-slate-500">
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
          {offers.map(offer => {
            const req = normalizeRequest(offer.requests)
            if (!req) return null
            const profile = normalizeProfile(req.profiles)
            const statusInfo = OFFER_STATUS[offer.status] ?? OFFER_STATUS.pending
            const isRejected = offer.status === 'rejected'
            const isRide = req.category === 'rides'
            const pageSubflow = subflowFromCategory(req.category, req.structured_data?.errand_type as string | null)
            const agreedPrice = offer.final_agreed_price ?? offer.requester_counter ?? offer.counter_budget
            const seats = offer.seats_requested ?? 1
            const statusLabelText = getStatusLabel(offer.status, pageSubflow, { agreedPrice, seats })

            return (
              <div
                key={offer.id}
                className={`relative overflow-hidden rounded-xl border border-[#1e2d4a] bg-[#0d1526] transition-all ${
                  offer.status === 'accepted' ? 'border-emerald-500/20' : ''
                } ${isRejected ? 'opacity-55' : ''}`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

                <div className="pl-5 pr-4 pt-4 pb-4">
                  {/* Top row: badges + status */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_BADGE[req.category]}`}>
                      {CATEGORY_LABELS[req.category] ?? req.category}
                    </span>
                    {!isRide && (
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${URGENCY_BADGE[req.urgency]}`}>
                        {req.urgency}
                      </span>
                    )}
                    <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusInfo.cls}`}>
                      {statusLabelText}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-[15px] font-semibold text-white leading-snug mb-3">{req.title}</p>

                  {/* Request meta */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                    {isRide && req.origin_city && req.destination_city ? (
                      <span className="flex items-center gap-1.5">
                        <span>🚗</span>
                        <span className="font-medium text-slate-300">{req.origin_city}</span>
                        <span className="text-slate-600">→</span>
                        <span className="font-medium text-slate-300">{req.destination_city}</span>
                      </span>
                    ) : req.location ? (
                      <span>📍 {req.location}</span>
                    ) : null}
                    {req.scheduled_time && (
                      <span>🕐 {new Date(req.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    )}
                    {req.budget != null && <span>💵 ${req.budget}</span>}
                  </div>

                  {/* Your offer details */}
                  {(offer.message || offer.counter_budget != null || offer.final_agreed_price != null) && (
                    <div className="mb-3 rounded-lg border border-[#1e2d4a] bg-white/[0.02] px-3 py-2.5 space-y-1.5">
                      {offer.message && (
                        <p className="text-xs text-slate-400 italic">"{offer.message}"</p>
                      )}
                      {offer.final_agreed_price != null ? (
                        <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          Agreed: ${offer.final_agreed_price}
                        </span>
                      ) : offer.requester_counter != null ? (
                        <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                          {getCounterLabel(pageSubflow, req.is_driver)}: ${offer.requester_counter}
                        </span>
                      ) : offer.counter_budget != null ? (
                        <span className="inline-flex rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                          Offered: ${offer.counter_budget}
                        </span>
                      ) : null}
                    </div>
                  )}

                  {/* Footer: requester info + time */}
                  <div className="flex items-center gap-2 border-t border-[#1e2d4a] pt-3">
                    <div className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-700/30 text-[11px] font-semibold text-blue-300">
                      {profile?.name ? profile.name[0].toUpperCase() : '?'}
                    </div>
                    <span className="text-xs text-slate-500">
                      {isRide ? 'Driver' : 'Requested by'}{' '}
                      <span className="text-slate-300">{profile?.name ?? 'Anonymous'}</span>
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
