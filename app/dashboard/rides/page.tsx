'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface RideRequest {
  id: string
  title: string
  urgency: string
  status: string
  budget: number | null
  scheduled_time: string | null
  created_at: string
  requester_id: string
  origin_city: string | null
  destination_city: string | null
  is_driver: boolean | null
  available_seats: number | null
  is_round_trip: boolean | null
  flexible_time: boolean | null
  profiles: { name: string | null; rating: number | null } | { name: string | null; rating: number | null }[] | null
}

function normalizeProfile(p: RideRequest['profiles']) {
  if (!p) return null
  return Array.isArray(p) ? p[0] ?? null : p
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

function routeKey(r: RideRequest) {
  return `${r.origin_city ?? '?'} → ${r.destination_city ?? '?'}`
}

export default function RidesPage() {
  const router = useRouter()
  const [rides, setRides] = useState<RideRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'passenger' | 'driver'>('passenger')
  const [matchCount, setMatchCount] = useState(0)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data } = await supabase
      .from('requests')
      .select('id, title, urgency, status, budget, scheduled_time, created_at, requester_id, origin_city, destination_city, is_driver, available_seats, is_round_trip, flexible_time, profiles(name, rating)')
      .eq('category', 'rides')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100)

    const allRides = (data ?? []) as RideRequest[]
    setRides(allRides)

    // Smart match: count drivers matching any of the current user's passenger requests
    const myPassengerRequests = allRides.filter(r => r.requester_id === user.id && r.is_driver === false)
    if (myPassengerRequests.length > 0) {
      const matchSet = new Set<string>()
      for (const pr of myPassengerRequests) {
        if (!pr.origin_city || !pr.destination_city) continue
        const params = new URLSearchParams({ origin_city: pr.origin_city, destination_city: pr.destination_city })
        if (pr.scheduled_time) params.set('scheduled_time', pr.scheduled_time)
        try {
          const res = await fetch(`/api/match-rides?${params}`)
          if (res.ok) {
            const matches = await res.json()
            for (const m of matches) matchSet.add(m.id)
          }
        } catch { /* ignore */ }
      }
      setMatchCount(matchSet.size)
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rides.filter(r => tab === 'driver' ? r.is_driver === true : r.is_driver !== true)

  // Group by route
  const grouped = new Map<string, RideRequest[]>()
  for (const r of filtered) {
    const key = routeKey(r)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }

  async function handleOffer(rideId: string, requesterId: string) {
    if (!userId || offeredIds.has(rideId)) return
    const supabase = createClient()
    const { error } = await supabase.from('request_offers').insert({
      request_id: rideId,
      helper_id: userId,
      status: 'pending',
    })
    if (!error) {
      await supabase.from('notifications').insert({
        user_id: requesterId,
        type: 'offer_received',
        message: 'You received a new offer on your ride request',
        related_request_id: rideId,
      })
      setOfferedIds(prev => new Set(prev).add(rideId))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading rides…
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Rides</h1>
          <p className="mt-1 text-sm text-slate-500">Find or offer rides with fellow students</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowWhatsApp(true)}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/[0.12] hover:border-emerald-500/40"
          >
            💬 Import WhatsApp
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-500/20"
          >
            + Post ride
          </button>
        </div>
      </div>

      {/* Smart match banner */}
      {matchCount > 0 && tab === 'driver' && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.08] px-4 py-3">
          <span className="text-xl">🎯</span>
          <p className="text-sm text-blue-300">
            We found <span className="font-semibold">{matchCount} driver{matchCount !== 1 ? 's' : ''}</span> going your way!
          </p>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e2d4a] mb-6">
        {([
          { key: 'passenger', label: 'Looking for Ride', icon: '🙋' },
          { key: 'driver', label: 'Offering a Ride', icon: '🚗' },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{icon}</span>
            {label}
            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              tab === key ? 'bg-blue-500/20 text-blue-400' : 'bg-white/[0.04] text-slate-600'
            }`}>
              {rides.filter(r => key === 'driver' ? r.is_driver === true : r.is_driver !== true).length}
            </span>
            {tab === key && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Route-grouped feed */}
      {grouped.size === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#1e2d4a] bg-[#0d1526]/60 py-16 text-center">
          <div className="mb-3 text-3xl">{tab === 'driver' ? '🚗' : '🙋'}</div>
          <p className="text-sm font-medium text-slate-400">
            {tab === 'driver' ? 'No drivers available right now' : 'No ride requests yet'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {tab === 'driver' ? 'Check back soon or post a request' : 'Post a request on the dashboard'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {[...grouped.entries()].map(([route, routeRides]) => (
            <div key={route}>
              {/* Route header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  {(() => {
                    const parts = route.split(' → ')
                    return (
                      <>
                        <span className="rounded-lg border border-[#1e2d4a] bg-[#0d1526] px-2.5 py-1 text-xs font-semibold text-white">
                          {parts[0]}
                        </span>
                        <svg className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                        </svg>
                        <span className="rounded-lg border border-[#1e2d4a] bg-[#0d1526] px-2.5 py-1 text-xs font-semibold text-white">
                          {parts[1]}
                        </span>
                      </>
                    )
                  })()}
                </div>
                <span className="text-xs text-slate-600">{routeRides.length} {routeRides.length === 1 ? 'post' : 'posts'}</span>
                <div className="flex-1 border-t border-[#1e2d4a]" />
              </div>

              <div className="flex flex-col gap-3">
                {routeRides.map(ride => (
                  <RideCard
                    key={ride.id}
                    ride={ride}
                    isOwn={ride.requester_id === userId}
                    hasOffered={offeredIds.has(ride.id)}
                    onOffer={() => handleOffer(ride.id, ride.requester_id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showWhatsApp && (
        <WhatsAppRideModal
          onClose={() => setShowWhatsApp(false)}
          onImported={() => { setShowWhatsApp(false); load() }}
        />
      )}
    </div>
  )
}

function RideCard({
  ride,
  isOwn,
  hasOffered,
  onOffer,
}: {
  ride: RideRequest
  isOwn: boolean
  hasOffered: boolean
  onOffer: () => void
}) {
  const profile = normalizeProfile(ride.profiles)

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1e2d4a] bg-[#0d1526] transition-all hover:border-blue-500/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40">
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${ride.is_driver ? 'bg-blue-500' : 'bg-purple-500'}`} />

      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            ride.is_driver
              ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
              : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
          }`}>
            {ride.is_driver ? '🚗 Offering ride' : '🙋 Needs ride'}
          </span>
          {ride.is_driver && ride.available_seats != null && (
            <span className="rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-[11px] text-slate-400">
              {ride.available_seats} seat{ride.available_seats !== 1 ? 's' : ''}
            </span>
          )}
          {ride.is_round_trip && (
            <span className="rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-[11px] text-slate-400">
              Round trip
            </span>
          )}
          {ride.flexible_time && (
            <span className="rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-[11px] text-slate-400">
              Flexible time
            </span>
          )}
        </div>

        <p className="text-[15px] font-semibold text-white leading-snug mb-3">{ride.title}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-4">
          {ride.scheduled_time && (
            <span className="flex items-center gap-1.5">
              🕐 {new Date(ride.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
          {ride.budget != null && <span className="flex items-center gap-1.5">💵 ${ride.budget}</span>}
        </div>

        <div className="flex items-center justify-between border-t border-[#1e2d4a] pt-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/40 to-blue-700/40 text-[11px] font-semibold text-blue-300">
              {profile?.name ? profile.name[0].toUpperCase() : '?'}
            </div>
            <span className="text-xs text-slate-400 font-medium">{profile?.name ?? 'Anonymous'}</span>
            {profile?.rating != null && (
              <span className="text-xs text-slate-600">★ {Number(profile.rating).toFixed(1)}</span>
            )}
            <span className="text-xs text-slate-700">·</span>
            <span className="text-xs text-slate-600">{timeAgo(ride.created_at)}</span>
          </div>

          {isOwn ? (
            <span className="text-xs text-slate-600">Your post</span>
          ) : hasOffered ? (
            <span className="text-xs font-semibold text-emerald-400">Offer sent ✓</span>
          ) : (
            <button
              type="button"
              onClick={onOffer}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-blue-500 active:scale-95"
            >
              {ride.is_driver ? 'Request seat' : 'Offer ride'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function WhatsAppRideModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [waText, setWaText] = useState('')
  const [waStatus, setWaStatus] = useState<'idle' | 'parsing' | 'confirm' | 'saving'>('idle')
  const [waParsed, setWaParsed] = useState<{
    category: string; title: string; origin_city?: string | null; destination_city?: string | null
    is_driver?: boolean | null; available_seats?: number | null; scheduled_time?: string | null
    budget?: number | null; is_round_trip?: boolean
  } | null>(null)
  const [waError, setWaError] = useState<string | null>(null)

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    if (!waText.trim()) return
    setWaError(null)
    setWaStatus('parsing')
    const res = await fetch('/api/parse-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: waText, source: 'whatsapp' }),
    })
    if (!res.ok) { setWaError('Parse failed. Try again.'); setWaStatus('idle'); return }
    const data = await res.json()
    if (!data.category || !data.title) { setWaError('Could not understand. Be more specific.'); setWaStatus('idle'); return }
    setWaParsed(data)
    setWaStatus('confirm')
  }

  async function handleConfirm() {
    if (!waParsed) return
    setWaStatus('saving')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setWaError('Session expired.'); setWaStatus('confirm'); return }
    const { error } = await supabase.from('requests').insert({
      requester_id: user.id,
      category: waParsed.category,
      title: waParsed.title,
      scheduled_time: waParsed.scheduled_time ?? undefined,
      budget: waParsed.budget ?? undefined,
      urgency: 'medium',
      origin_city: waParsed.origin_city ?? undefined,
      destination_city: waParsed.destination_city ?? undefined,
      is_driver: waParsed.is_driver ?? undefined,
      available_seats: waParsed.available_seats ?? undefined,
      is_round_trip: waParsed.is_round_trip ?? false,
    })
    if (error) { setWaError(error.message); setWaStatus('confirm'); return }
    onImported()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-emerald-500/20 bg-[#0a0f1e] p-6 shadow-2xl shadow-black/60">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-slate-300">✕</button>
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-xl">💬</span>
          <h3 className="text-sm font-semibold text-white">Import from WhatsApp</h3>
        </div>
        <p className="mb-5 text-xs text-slate-500">Paste a ride message and we&apos;ll extract the details.</p>

        {waStatus === 'idle' || waStatus === 'parsing' ? (
          <form onSubmit={handleParse} className="flex flex-col gap-4">
            <textarea
              rows={4}
              value={waText}
              onChange={e => setWaText(e.target.value)}
              placeholder="e.g. yo anyone heading to DFW on Friday? i can take 2 people, leaving UTD at 7am"
              disabled={waStatus === 'parsing'}
              className="w-full resize-none rounded-xl border border-[#1e2d4a] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-emerald-500/40 disabled:opacity-60"
            />
            {waError && <p className="text-xs text-red-400">{waError}</p>}
            <button type="submit" disabled={!waText.trim() || waStatus === 'parsing'} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
              {waStatus === 'parsing' ? 'Parsing…' : 'Parse message'}
            </button>
          </form>
        ) : waParsed ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[#1e2d4a] bg-white/[0.02] p-4 flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-xs text-slate-500">Title</span>
                <span className="text-white text-right">{waParsed.title}</span>
              </div>
              {waParsed.origin_city && waParsed.destination_city && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Route</span>
                  <span className="flex items-center gap-2 text-sm text-white">
                    {waParsed.origin_city} <span className="text-slate-500">→</span> {waParsed.destination_city}
                  </span>
                </div>
              )}
              {waParsed.is_driver !== null && waParsed.is_driver !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Role</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${waParsed.is_driver ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-purple-400 bg-purple-500/10 border-purple-500/20'}`}>
                    {waParsed.is_driver ? '🚗 Offering ride' : '🙋 Needs ride'}
                  </span>
                </div>
              )}
              {waParsed.scheduled_time && (
                <div className="flex justify-between text-sm">
                  <span className="text-xs text-slate-500">Time</span>
                  <span className="text-white">{new Date(waParsed.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              )}
            </div>
            {waError && <p className="text-xs text-red-400">{waError}</p>}
            <div className="flex gap-3">
              <button onClick={handleConfirm} disabled={waStatus === 'saving'} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {waStatus === 'saving' ? 'Posting…' : 'Post ride'}
              </button>
              <button onClick={() => { setWaStatus('idle'); setWaParsed(null) }} disabled={waStatus === 'saving'} className="rounded-xl border border-[#1e2d4a] px-4 py-2.5 text-sm text-slate-400 hover:text-white disabled:opacity-40">
                Edit
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
