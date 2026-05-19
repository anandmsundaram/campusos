'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RideRequest {
  id: string
  title: string
  urgency: string
  status: string
  budget: number | null
  price_type: 'fixed' | 'split' | 'free' | null
  is_airport_ride: boolean | null
  scheduled_time: string | null
  created_at: string
  requester_id: string
  origin_city: string | null
  destination_city: string | null
  is_driver: boolean | null
  available_seats: number | null
  seats_filled: number
  auto_accept: boolean
  ride_started: boolean
  is_round_trip: boolean | null
  flexible_time: boolean | null
  profiles: { name: string | null; rating: number | null } | { name: string | null; rating: number | null }[] | null
}

interface PassengerRow {
  id: string
  request_id: string
  passenger_id: string
  status: 'pending' | 'confirmed' | 'cancelled'
  price_agreed: number | null
  created_at: string
  profiles?: { name: string | null; rating: number | null } | null
}

interface RideMessage {
  id: string
  request_id: string
  sender_id: string
  content: string
  created_at: string
  profiles?: { name: string | null } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AIRPORT_KW = ['airport', 'iah', 'dfw', 'hou', 'aus', 'sat', 'dal', 'bush', 'hobby', 'midway', 'intercontinental']
const DATE_GROUP_ORDER = ['today', 'tomorrow', 'weekend', 'next_week', 'later', 'flexible'] as const
type DateGroup = typeof DATE_GROUP_ORDER[number]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function getDateGroup(scheduledTime: string | null): DateGroup {
  if (!scheduledTime) return 'flexible'
  const d = new Date(scheduledTime)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((d.getTime() - today.getTime()) / 86400000)
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  const dow = d.getDay() // 0=Sun 6=Sat
  if ((dow === 0 || dow === 6) && diffDays <= 6) return 'weekend'
  if (diffDays <= 7) return 'next_week'
  return 'later'
}

function dateGroupLabel(group: DateGroup): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const now = new Date()
  switch (group) {
    case 'today':     return `Today — ${fmt(now)}`
    case 'tomorrow':  return `Tomorrow — ${fmt(new Date(now.getTime() + 86400000))}`
    case 'weekend':   return 'This Weekend'
    case 'next_week': return 'Next Week'
    case 'later':     return 'Later'
    case 'flexible':  return 'Flexible / No Date'
  }
}

function isAirportRelated(ride: RideRequest): boolean {
  if (ride.is_airport_ride) return true
  const combined = `${ride.origin_city ?? ''} ${ride.destination_city ?? ''}`.toLowerCase()
  return AIRPORT_KW.some(kw => combined.includes(kw))
}

function formatPrice(ride: RideRequest): string {
  if (ride.price_type === 'free') return '🎁 Free'
  if (ride.price_type === 'fixed' && ride.budget != null) return `$${ride.budget} / seat`
  if (ride.price_type === 'split') return '⛽ Split gas'
  if (ride.budget != null) return `$${ride.budget} / seat`
  return '⛽ Split gas'
}

function findReturnTrip(ride: RideRequest, allRides: RideRequest[]): RideRequest | null {
  if (!ride.origin_city || !ride.destination_city) return null
  const orig = ride.origin_city.toLowerCase()
  const dest = ride.destination_city.toLowerCase()
  return allRides.find(r =>
    r.id !== ride.id &&
    r.origin_city?.toLowerCase() === dest &&
    r.destination_city?.toLowerCase() === orig &&
    (ride.scheduled_time == null || r.scheduled_time == null ||
     new Date(r.scheduled_time) > new Date(ride.scheduled_time))
  ) ?? null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RidesPage() {
  const router = useRouter()
  const [rides, setRides] = useState<RideRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'passenger' | 'driver'>('passenger')
  const [search, setSearch] = useState('')
  const [airportFilter, setAirportFilter] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [passengersByRide, setPassengersByRide] = useState<Map<string, PassengerRow[]>>(new Map())
  const [myPassengerEntries, setMyPassengerEntries] = useState<Map<string, PassengerRow>>(new Map())
  const [chatRideId, setChatRideId] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [highlightedRideId, setHighlightedRideId] = useState<string | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    let { data: ridesData, error: ridesError } = await supabase
      .from('requests')
      .select(`
        id, requester_id, category, title, description, location,
        budget, urgency, status, scheduled_time, created_at,
        origin_city, destination_city, is_driver, available_seats,
        is_round_trip, return_date, flexible_time,
        auto_accept, seats_filled, ride_started,
        price_type, is_airport_ride,
        profiles!requester_id (
          id, name, university, rating, completed_tasks, verification_status
        )
      `)
      .eq('category', 'rides')
      .eq('status', 'open')
      .order('scheduled_time', { ascending: true })

    // Schema cache fallback — retry without migration 006/007 columns
    if (ridesError && /schema cache|Could not find the/i.test(ridesError.message)) {
      const fallback = await supabase
        .from('requests')
        .select(`
          id, requester_id, category, title, description, location,
          budget, urgency, status, scheduled_time, created_at,
          origin_city, destination_city, is_driver, available_seats,
          is_round_trip, return_date, flexible_time,
          profiles!requester_id (
            id, name, university, rating, completed_tasks, verification_status
          )
        `)
        .eq('category', 'rides')
        .eq('status', 'open')
        .order('scheduled_time', { ascending: true })
      ridesData = fallback.data as typeof ridesData
      ridesError = fallback.error
    }

    const allRides = (ridesData ?? []) as RideRequest[]
    setRides(allRides)

    // My passenger entries (rides I've joined)
    const { data: myEntries } = await supabase
      .from('ride_passengers')
      .select('id, request_id, passenger_id, status, price_agreed, created_at')
      .eq('passenger_id', user.id)
      .neq('status', 'cancelled')

    const entriesMap = new Map<string, PassengerRow>()
    for (const e of (myEntries ?? []) as PassengerRow[]) {
      entriesMap.set(e.request_id, e)
    }
    setMyPassengerEntries(entriesMap)

    // Passengers for rides I'm driving
    const myDriverRideIds = allRides
      .filter(r => r.requester_id === user.id && r.is_driver)
      .map(r => r.id)

    if (myDriverRideIds.length > 0) {
      const { data: pData } = await supabase
        .from('ride_passengers')
        .select('id, request_id, passenger_id, status, price_agreed, created_at, profiles(name, rating)')
        .in('request_id', myDriverRideIds)
        .neq('status', 'cancelled')

      const pMap = new Map<string, PassengerRow[]>()
      for (const p of (pData ?? []) as unknown as PassengerRow[]) {
        if (!pMap.has(p.request_id)) pMap.set(p.request_id, [])
        pMap.get(p.request_id)!.push(p)
      }
      setPassengersByRide(pMap)
    }

    // Smart match count
    const myPassengerRides = allRides.filter(r => r.requester_id === user.id && r.is_driver === false)
    if (myPassengerRides.length > 0) {
      const matchSet = new Set<string>()
      for (const pr of myPassengerRides) {
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

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleRequestSeat(ride: RideRequest) {
    if (!userId || acting) return
    setActing(ride.id)
    const supabase = createClient()

    const isFull = ride.available_seats != null && ride.seats_filled >= ride.available_seats
    if (isFull || ride.ride_started) { setActing(null); return }

    const willAutoAccept = ride.auto_accept && (ride.available_seats == null || ride.seats_filled < ride.available_seats)
    const newStatus = willAutoAccept ? 'confirmed' : 'pending'

    const { error } = await supabase.from('ride_passengers').insert({
      request_id: ride.id,
      passenger_id: userId,
      status: newStatus,
      price_agreed: ride.budget ?? null,
    })

    if (error) { setActing(null); return }

    if (willAutoAccept) {
      const newFilled = ride.seats_filled + 1
      const updates: Record<string, unknown> = { seats_filled: newFilled }
      if (ride.available_seats != null && newFilled >= ride.available_seats) updates.status = 'matched'
      await supabase.from('requests').update(updates).eq('id', ride.id)
      await supabase.from('notifications').insert({
        user_id: ride.requester_id, type: 'offer_received',
        message: `A passenger has joined your ride to ${ride.destination_city ?? 'your destination'}`,
        related_request_id: ride.id,
      })
      setRides(prev => prev.map(r => r.id === ride.id
        ? { ...r, seats_filled: newFilled, status: updates.status ? String(updates.status) : r.status } : r))
    } else {
      await supabase.from('notifications').insert({
        user_id: ride.requester_id, type: 'offer_received',
        message: `Someone requested a seat on your ride to ${ride.destination_city ?? 'your destination'}. Approve or decline.`,
        related_request_id: ride.id,
      })
    }

    const newEntry: PassengerRow = {
      id: '', request_id: ride.id, passenger_id: userId,
      status: newStatus as 'pending' | 'confirmed' | 'cancelled',
      price_agreed: ride.budget ?? null, created_at: new Date().toISOString(),
    }
    setMyPassengerEntries(prev => new Map(prev).set(ride.id, newEntry))
    setActing(null)
  }

  async function handleCancelSeat(ride: RideRequest) {
    if (!userId || acting) return
    const entry = myPassengerEntries.get(ride.id)
    if (!entry) return
    setActing(ride.id)
    const supabase = createClient()

    const { error } = await supabase.from('ride_passengers').update({ status: 'cancelled' }).eq('id', entry.id)
    if (error) { setActing(null); return }

    const updates: Record<string, unknown> = { seats_filled: Math.max(0, ride.seats_filled - 1) }
    if (ride.status === 'matched') updates.status = 'open'
    await supabase.from('requests').update(updates).eq('id', ride.id)
    await supabase.from('notifications').insert({
      user_id: ride.requester_id, type: 'offer_rejected',
      message: `A passenger cancelled their seat on your ride to ${ride.destination_city ?? 'your destination'}`,
      related_request_id: ride.id,
    })
    setMyPassengerEntries(prev => { const m = new Map(prev); m.delete(ride.id); return m })
    setRides(prev => prev.map(r => r.id === ride.id
      ? { ...r, seats_filled: Math.max(0, r.seats_filled - 1), status: updates.status ? String(updates.status) : r.status } : r))
    setActing(null)
  }

  async function handleApprove(rideId: string, entryId: string, passengerId: string, ride: RideRequest) {
    if (acting) return
    setActing(entryId)
    const supabase = createClient()

    const { error } = await supabase.from('ride_passengers').update({ status: 'confirmed' }).eq('id', entryId)
    if (error) { setActing(null); return }

    const newFilled = ride.seats_filled + 1
    const reqUpdates: Record<string, unknown> = { seats_filled: newFilled }
    if (ride.available_seats != null && newFilled >= ride.available_seats) reqUpdates.status = 'matched'
    await supabase.from('requests').update(reqUpdates).eq('id', rideId)
    await supabase.from('notifications').insert({
      user_id: passengerId, type: 'offer_accepted',
      message: `Your seat on the ride to ${ride.destination_city ?? 'your destination'} has been confirmed!`,
      related_request_id: rideId,
    })
    setPassengersByRide(prev => {
      const m = new Map(prev)
      m.set(rideId, (m.get(rideId) ?? []).map(p => p.id === entryId ? { ...p, status: 'confirmed' as const } : p))
      return m
    })
    setRides(prev => prev.map(r => r.id === rideId
      ? { ...r, seats_filled: newFilled, status: reqUpdates.status ? String(reqUpdates.status) : r.status } : r))
    setActing(null)
  }

  async function handleDecline(rideId: string, entryId: string, passengerId: string, ride: RideRequest) {
    if (acting) return
    setActing(entryId)
    const supabase = createClient()

    await supabase.from('ride_passengers').update({ status: 'cancelled' }).eq('id', entryId)
    await supabase.from('notifications').insert({
      user_id: passengerId, type: 'offer_rejected',
      message: `Your seat request for the ride to ${ride.destination_city ?? 'your destination'} was declined.`,
      related_request_id: rideId,
    })
    setPassengersByRide(prev => {
      const m = new Map(prev)
      m.set(rideId, (m.get(rideId) ?? []).filter(p => p.id !== entryId))
      return m
    })
    setActing(null)
  }

  async function handleDriverCancelRide(ride: RideRequest) {
    if (acting) return
    setActing(ride.id)
    const supabase = createClient()

    await supabase.from('requests').update({ status: 'cancelled' }).eq('id', ride.id)
    for (const p of passengersByRide.get(ride.id) ?? []) {
      await supabase.from('notifications').insert({
        user_id: p.passenger_id, type: 'offer_rejected',
        message: `The ride to ${ride.destination_city ?? 'your destination'} has been cancelled by the driver.`,
        related_request_id: ride.id,
      })
    }
    setRides(prev => prev.filter(r => r.id !== ride.id))
    setActing(null)
  }

  async function handleStartRide(ride: RideRequest) {
    if (acting) return
    setActing(ride.id)
    const supabase = createClient()

    await supabase.from('requests').update({ ride_started: true }).eq('id', ride.id)
    for (const p of (passengersByRide.get(ride.id) ?? []).filter(p => p.status === 'confirmed')) {
      await supabase.from('notifications').insert({
        user_id: p.passenger_id, type: 'new_message',
        message: `Your driver has started the ride to ${ride.destination_city ?? 'your destination'}. Have a safe trip!`,
        related_request_id: ride.id,
      })
    }
    setRides(prev => prev.map(r => r.id === ride.id ? { ...r, ride_started: true } : r))
    setActing(null)
  }

  async function handleDmDriver(ride: RideRequest) {
    if (!userId) return
    const supabase = createClient()

    // Only create an initial message if no thread exists yet
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('request_id', ride.id)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabase.from('messages').insert({
        sender_id: userId,
        receiver_id: ride.requester_id,
        request_id: ride.id,
        content: `Hi! I'm interested in your ride from ${ride.origin_city ?? 'your location'} to ${ride.destination_city ?? 'your destination'}.`,
      })
      await supabase.from('notifications').insert({
        user_id: ride.requester_id,
        type: 'new_message',
        message: `New message about your ride to ${ride.destination_city ?? 'your destination'}`,
        related_request_id: ride.id,
      })
    }

    router.push('/dashboard/messages')
  }

  function scrollToCard(rideId: string) {
    setHighlightedRideId(rideId)
    cardRefs.current.get(rideId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => setHighlightedRideId(null), 2000)
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const q = search.toLowerCase()
  const filtered = rides.filter(r => {
    if (tab === 'driver' ? r.is_driver !== true : r.is_driver === true) return false
    if (airportFilter && !isAirportRelated(r)) return false
    if (q) {
      const hay = `${r.title} ${r.origin_city ?? ''} ${r.destination_city ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Date-based groups, sorted by scheduled_time within each group
  const grouped = new Map<DateGroup, RideRequest[]>()
  for (const g of DATE_GROUP_ORDER) grouped.set(g, [])
  for (const r of filtered) grouped.get(getDateGroup(r.scheduled_time))!.push(r)
  for (const [, items] of grouped) {
    items.sort((a, b) => {
      if (!a.scheduled_time) return 1
      if (!b.scheduled_time) return -1
      return new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
    })
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

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

  const chatRide = chatRideId ? rides.find(r => r.id === chatRideId) ?? null : null

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Rides</h1>
          <p className="mt-1 text-sm text-slate-500">Find or offer rides with fellow students</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-500/20"
        >
          + Post ride
        </button>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by city, e.g. Houston, DFW, Austin..."
          className="w-full bg-[#0d1526] border border-[#1e2d4a] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500/50 transition-colors"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Smart match banner */}
      {matchCount > 0 && tab === 'driver' && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.08] px-4 py-3">
          <span className="text-xl">🎯</span>
          <p className="text-sm text-blue-300">
            We found <span className="font-semibold">{matchCount} driver{matchCount !== 1 ? 's' : ''}</span> going your way!
          </p>
        </div>
      )}

      {/* Sub-tabs + airport filter */}
      <div className="flex items-center gap-1 border-b border-[#1e2d4a] mb-6">
        {([
          { key: 'passenger', label: 'Looking for Ride', icon: '🙋' },
          { key: 'driver',    label: 'Offering a Ride',  icon: '🚗' },
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

        <button
          type="button"
          onClick={() => setAirportFilter(v => !v)}
          className={`ml-2 mb-1 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            airportFilter
              ? 'border-blue-500/40 bg-blue-600 text-white'
              : 'border-[#1e2d4a] text-slate-500 hover:border-blue-500/20 hover:text-blue-400'
          }`}
        >
          ✈️ Airport
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#1e2d4a] bg-[#0d1526]/60 py-16 text-center">
          <div className="mb-3 text-3xl">{airportFilter ? '✈️' : tab === 'driver' ? '🚗' : '🙋'}</div>
          <p className="text-sm font-medium text-slate-400">
            {search
              ? `No rides found for "${search}"`
              : airportFilter
              ? 'No airport rides posted yet'
              : tab === 'driver'
              ? 'No rides available right now'
              : 'No one is looking for a ride right now'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {search
              ? 'Try a different city name'
              : airportFilter
              ? 'Going to the airport? Post your ride!'
              : tab === 'driver'
              ? 'Offer a ride to help fellow students'
              : 'Be the first to post a ride request!'}
          </p>
          {!search && (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              {tab === 'driver' ? 'Offer a ride' : 'Post a ride request'}
            </button>
          )}
        </div>
      ) : (
        <div>
          {DATE_GROUP_ORDER.map(group => {
            const items = grouped.get(group) ?? []
            if (items.length === 0) return null
            return (
              <div key={group} className="mb-8">
                <p className="text-gray-400 text-xs uppercase tracking-wider border-b border-[#1e2d4a] pb-2 mb-4">
                  {dateGroupLabel(group)}
                </p>
                <div className="flex flex-col gap-4">
                  {items.map(ride => {
                    const isOwn = ride.requester_id === userId
                    const myEntry = myPassengerEntries.get(ride.id)
                    const passengers = passengersByRide.get(ride.id) ?? []
                    const confirmedPassengers = passengers.filter(p => p.status === 'confirmed')
                    const earnings = confirmedPassengers.reduce((sum, p) => sum + (p.price_agreed ?? 0), 0)
                    const isFull = ride.available_seats != null && ride.seats_filled >= ride.available_seats
                    const seatsLeft = ride.available_seats != null ? ride.available_seats - ride.seats_filled : null
                    const canChat = isOwn || myEntry?.status === 'confirmed'
                    const returnTrip = findReturnTrip(ride, rides)

                    return (
                      <div key={ride.id}>
                        <RideCard
                          ride={ride}
                          isOwn={isOwn}
                          myEntry={myEntry ?? null}
                          isFull={isFull}
                          seatsLeft={seatsLeft}
                          earnings={isOwn && ride.is_driver ? earnings : null}
                          confirmedCount={isOwn ? confirmedPassengers.length : 0}
                          acting={acting}
                          canChat={canChat}
                          highlighted={highlightedRideId === ride.id}
                          onRequestSeat={() => handleRequestSeat(ride)}
                          onCancelSeat={() => handleCancelSeat(ride)}
                          onStartRide={() => handleStartRide(ride)}
                          onCancelRide={() => handleDriverCancelRide(ride)}
                          onOpenChat={() => setChatRideId(ride.id)}
                          onDmDriver={() => handleDmDriver(ride)}
                          setRef={el => {
                            if (el) cardRefs.current.set(ride.id, el)
                            else cardRefs.current.delete(ride.id)
                          }}
                        />

                        {/* Return trip banner */}
                        {returnTrip && (
                          <button
                            type="button"
                            onClick={() => scrollToCard(returnTrip.id)}
                            className="mt-2 w-full flex items-center gap-2 bg-blue-950 border border-blue-800 rounded-lg px-3 py-2 text-blue-300 text-xs hover:bg-blue-900 transition-colors"
                          >
                            <span>↩️</span>
                            <span>
                              Return trip available:{' '}
                              <span className="font-medium">{returnTrip.origin_city} → {returnTrip.destination_city}</span>
                              {returnTrip.scheduled_time && (
                                <> on {new Date(returnTrip.scheduled_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
                              )}
                            </span>
                          </button>
                        )}

                        {/* Passenger management for driver's own cards */}
                        {isOwn && ride.is_driver && passengers.length > 0 && (
                          <PassengerSection
                            passengers={passengers}
                            ride={ride}
                            acting={acting}
                            onApprove={(entryId, passengerId) => handleApprove(ride.id, entryId, passengerId, ride)}
                            onDecline={(entryId, passengerId) => handleDecline(ride.id, entryId, passengerId, ride)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {chatRide && (
        <GroupChatModal
          ride={chatRide}
          userId={userId ?? ''}
          onClose={() => setChatRideId(null)}
        />
      )}
    </div>
  )
}

// ─── Ride Card ────────────────────────────────────────────────────────────────

function RideCard({
  ride, isOwn, myEntry, isFull, seatsLeft, earnings, confirmedCount, acting,
  canChat, highlighted, onRequestSeat, onCancelSeat, onStartRide, onCancelRide,
  onOpenChat, onDmDriver, setRef,
}: {
  ride: RideRequest
  isOwn: boolean
  myEntry: PassengerRow | null
  isFull: boolean
  seatsLeft: number | null
  earnings: number | null
  confirmedCount: number
  acting: string | null
  canChat: boolean
  highlighted: boolean
  onRequestSeat: () => void
  onCancelSeat: () => void
  onStartRide: () => void
  onCancelRide: () => void
  onOpenChat: () => void
  onDmDriver: () => void
  setRef: (el: HTMLDivElement | null) => void
}) {
  const profile = normalizeProfile(ride.profiles)
  const isActing = acting === ride.id
  const showDmDriver = !isOwn && !myEntry

  return (
    <div
      ref={setRef}
      className={`relative overflow-hidden rounded-xl border bg-[#0d1526] transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 ${
        highlighted
          ? 'border-blue-400 shadow-lg shadow-blue-500/20'
          : 'border-[#1e2d4a] hover:border-blue-500/20'
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${ride.is_driver ? 'bg-blue-500' : 'bg-purple-500'}`} />

      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* Route — prominent */}
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-base font-semibold text-white">{ride.origin_city ?? '—'}</span>
          <svg className="h-4 w-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
          </svg>
          <span className="text-base font-semibold text-white">{ride.destination_city ?? '—'}</span>
        </div>

        {/* Date + time badge */}
        {ride.scheduled_time && (
          <div className="mb-3">
            <span className="bg-[#1e2d4a] text-gray-300 text-xs px-2.5 py-1 rounded-full">
              {new Date(ride.scheduled_time).toLocaleString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
          </div>
        )}

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
            isFull ? (
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-400">
                FULL
              </span>
            ) : (
              <span className="rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-[11px] text-slate-400">
                {seatsLeft} of {ride.available_seats} seats left
              </span>
            )
          )}

          <span className="rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-[11px] text-slate-400">
            {formatPrice(ride)}
          </span>

          {isAirportRelated(ride) && (
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[11px] text-blue-400">
              ✈️ Airport
            </span>
          )}
          {ride.is_round_trip && (
            <span className="rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-[11px] text-slate-400">
              ↩️ Round trip
            </span>
          )}
          {ride.flexible_time && (
            <span className="rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-[11px] text-slate-400">Flexible</span>
          )}
          {ride.ride_started && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              🚀 In progress
            </span>
          )}
        </div>

        {/* My passenger status */}
        {!isOwn && myEntry && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium ${
            myEntry.status === 'confirmed'
              ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
              : 'border-yellow-500/20 bg-yellow-500/[0.07] text-yellow-400'
          }`}>
            {myEntry.status === 'confirmed'
              ? `✓ Seat confirmed${myEntry.price_agreed != null ? ` · You agreed to pay $${myEntry.price_agreed}` : ''}`
              : '⏳ Seat request pending driver approval'}
          </div>
        )}

        {/* Earnings for own driver rides */}
        {earnings != null && earnings > 0 && (
          <div className="mb-3 text-xs text-emerald-400 font-medium">
            💰 ${earnings.toFixed(2)} collected from confirmed passengers
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#1e2d4a] pt-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/40 to-blue-700/40 text-[11px] font-semibold text-blue-300">
              {profile?.name ? profile.name[0].toUpperCase() : '?'}
            </div>
            <span className="text-xs text-slate-400 font-medium truncate">{profile?.name ?? 'Anonymous'}</span>
            {profile?.rating != null && (
              <span className="text-xs text-slate-600 flex-shrink-0">★ {Number(profile.rating).toFixed(1)}</span>
            )}
            <span className="text-xs text-slate-700">·</span>
            <span className="text-xs text-slate-600 flex-shrink-0">posted {timeAgo(ride.created_at)}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="rounded-lg border border-[#1e2d4a] px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-blue-500/30 hover:text-blue-400"
              >
                💬 Chat
              </button>
            )}

            {showDmDriver && (
              <button
                type="button"
                onClick={onDmDriver}
                className="rounded-lg bg-gray-700 hover:bg-gray-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors"
              >
                💬 DM
              </button>
            )}

            {isOwn && ride.is_driver ? (
              <div className="flex items-center gap-2">
                {!ride.ride_started && confirmedCount >= 1 && (
                  <button
                    type="button"
                    onClick={onStartRide}
                    disabled={!!acting}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {isActing ? '…' : '🚀 Start Ride'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCancelRide}
                  disabled={!!acting}
                  className="rounded-lg border border-[#1e2d4a] px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                >
                  {isActing ? '…' : 'Cancel ride'}
                </button>
              </div>
            ) : isOwn ? (
              <span className="text-xs text-slate-600">Your request</span>
            ) : myEntry ? (
              <button
                type="button"
                onClick={onCancelSeat}
                disabled={!!acting}
                className="rounded-lg border border-[#1e2d4a] px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
              >
                {myEntry.status === 'pending' ? 'Cancel request' : 'Leave ride'}
              </button>
            ) : isFull || ride.ride_started ? (
              <span className="text-xs font-semibold text-slate-600">{isFull ? 'Full' : 'Started'}</span>
            ) : (
              <button
                type="button"
                onClick={onRequestSeat}
                disabled={!!acting}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-40"
              >
                {isActing ? '…' : ride.is_driver ? 'Request seat' : 'Offer ride'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Passenger Management Section ────────────────────────────────────────────

function PassengerSection({
  passengers, ride, acting, onApprove, onDecline,
}: {
  passengers: PassengerRow[]
  ride: RideRequest
  acting: string | null
  onApprove: (entryId: string, passengerId: string) => void
  onDecline: (entryId: string, passengerId: string) => void
}) {
  const confirmed = passengers.filter(p => p.status === 'confirmed')
  const pending   = passengers.filter(p => p.status === 'pending')

  return (
    <div className="ml-3 mt-1 rounded-b-xl border border-t-0 border-[#1e2d4a] bg-[#070c1a] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-3">
        Passengers · {confirmed.length} confirmed{pending.length > 0 ? ` · ${pending.length} pending` : ''}
      </p>

      {confirmed.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {confirmed.map(p => {
            const prof = p.profiles as { name: string | null; rating: number | null } | null
            return (
              <div key={p.id} className="flex items-center gap-2.5">
                <div className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-700/30 text-[11px] font-semibold text-emerald-300">
                  {prof?.name ? prof.name[0].toUpperCase() : '?'}
                </div>
                <span className="text-xs font-medium text-slate-300">{prof?.name ?? 'Passenger'}</span>
                {prof?.rating != null && <span className="text-xs text-slate-600">★ {Number(prof.rating).toFixed(1)}</span>}
                {p.price_agreed != null && (
                  <span className="ml-auto text-xs font-semibold text-emerald-400">${p.price_agreed}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          {pending.map(p => {
            const prof = p.profiles as { name: string | null; rating: number | null } | null
            const isActing = acting === p.id
            const isFull = ride.available_seats != null && ride.seats_filled >= ride.available_seats
            return (
              <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-yellow-500/10 bg-yellow-500/[0.04] px-2.5 py-2">
                <div className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-500/30 to-yellow-700/30 text-[11px] font-semibold text-yellow-300">
                  {prof?.name ? prof.name[0].toUpperCase() : '?'}
                </div>
                <span className="flex-1 text-xs font-medium text-slate-300">{prof?.name ?? 'Passenger'}</span>
                {p.price_agreed != null && <span className="text-xs text-yellow-400">${p.price_agreed}</span>}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onApprove(p.id, p.passenger_id)}
                    disabled={!!acting || isFull}
                    className="rounded-md bg-emerald-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {isActing ? '…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecline(p.id, p.passenger_id)}
                    disabled={!!acting}
                    className="rounded-md border border-[#1e2d4a] px-2 py-1 text-[11px] font-medium text-slate-400 hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                  >
                    {isActing ? '…' : 'Decline'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Group Chat Modal ─────────────────────────────────────────────────────────

function GroupChatModal({ ride, userId, onClose }: { ride: RideRequest; userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<RideMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase
      .from('ride_messages')
      .select('id, request_id, sender_id, content, created_at, profiles(name)')
      .eq('request_id', ride.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setMessages((data ?? []) as unknown as RideMessage[])
        setLoading(false)
      })

    const channel = supabase
      .channel(`ride-chat-${ride.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `request_id=eq.${ride.id}` },
        async (payload) => {
          const { data: msg } = await supabase
            .from('ride_messages')
            .select('id, request_id, sender_id, content, created_at, profiles(name)')
            .eq('id', payload.new.id)
            .single()
          if (msg) setMessages(prev => [...prev, msg as unknown as RideMessage])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ride.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    const supabase = createClient()
    await supabase.from('ride_messages').insert({
      request_id: ride.id,
      sender_id: userId,
      content: text.trim(),
    })
    setText('')
    setSending(false)
  }

  const dest = ride.destination_city ?? 'Ride'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-[#0a0f1e] sm:rounded-2xl border border-[#1e2d4a] shadow-2xl shadow-black/60 flex flex-col" style={{ height: '70vh' }}>
        <div className="flex items-center gap-3 border-b border-[#1e2d4a] px-4 py-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Ride Chat</p>
            <p className="text-xs text-slate-500 truncate">
              {ride.origin_city ?? '?'} → {dest}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-slate-300">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-600">No messages yet. Say hi!</div>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === userId
              const senderName = (msg.profiles as { name: string | null } | null)?.name ?? 'Unknown'
              return (
                <div key={msg.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-700/30 text-[11px] font-semibold text-blue-300">
                    {senderName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                    {!isMe && <span className="text-[10px] text-slate-600 pl-0.5">{senderName}</span>}
                    <div className={`rounded-2xl px-3 py-2 text-sm ${
                      isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-[#1a2540] text-slate-200 rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-slate-700 px-0.5">{timeAgo(msg.created_at)}</span>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="border-t border-[#1e2d4a] px-4 py-3 flex gap-2 flex-shrink-0">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Message the group…"
            disabled={sending}
            className="flex-1 rounded-xl border border-[#1e2d4a] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500/40"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
