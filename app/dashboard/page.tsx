import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RequestInput from './RequestInput'
import RequestFeed, { type FeedRequest, type MyOffer, type FeedRequestWithOffers } from './RequestFeed'

function isSchemaErr(msg?: string | null) {
  return !!msg && /schema cache|Could not find the/i.test(msg)
}

// ─── Types for next-ride widget ───────────────────────────────────────────────

interface DriverRideRow {
  title: string
  origin_city: string | null
  destination_city: string | null
  scheduled_time: string | null
  available_seats: number | null
}

interface PaxRideReq {
  title: string
  origin_city: string | null
  destination_city: string | null
  scheduled_time: string | null
  available_seats: number | null
  profiles: { name: string | null } | { name: string | null }[] | null
}

interface PaxRideRow {
  price_agreed: number | null
  requests: PaxRideReq | PaxRideReq[] | null
}

interface NextRideInfo {
  title: string
  origin_city: string | null
  destination_city: string | null
  scheduled_time: string | null
  available_seats: number | null
  role: 'driver' | 'passenger'
  price_agreed: number | null
  driver_name: string | null
}

// ─── Select strings ───────────────────────────────────────────────────────────

// Full column list — requires schema cache to be refreshed after migrations 006 & 007.
// Dashboard: Supabase → Settings → API → Reload schema cache
const FULL_SELECT = `
  id, requester_id, category, title, description, location,
  budget, urgency, status, scheduled_time, created_at,
  origin_city, destination_city, is_driver, available_seats,
  is_round_trip, return_date, flexible_time,
  auto_accept, seats_filled, ride_started,
  price_type, is_airport_ride,
  profiles!requester_id (
    id, name, university, rating, completed_tasks, verification_status
  )
`

// Safe fallback — only columns present since migration 005 or earlier.
const BASE_SELECT = `
  id, requester_id, category, title, description, location,
  budget, urgency, status, scheduled_time, created_at,
  origin_city, destination_city, is_driver, available_seats,
  is_round_trip, return_date, flexible_time,
  profiles!requester_id (
    id, name, university, rating, completed_tasks, verification_status
  )
`

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date().toISOString()

  // ── Step 1: fetch all open requests (STEP 3 from debug spec) ──────────────
  const { data: requests, error: requestsError } = await supabase
    .from('requests')
    .select(FULL_SELECT)
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  // STEP 1: Debug logging — visible in the Next.js terminal (server-side)
  console.log('[dashboard] requests fetched:', requests?.length ?? 0, '| error:', requestsError?.message ?? 'none')
  if (requestsError) console.error('[dashboard] full requestsError:', JSON.stringify(requestsError))

  // Schema cache fallback — retry without migration 006/007 columns
  let feedData: unknown[] = requests ?? []
  if (isSchemaErr(requestsError?.message)) {
    const { data: fallback, error: fallbackErr } = await supabase
      .from('requests')
      .select(BASE_SELECT)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    console.log('[dashboard] fallback fetched:', fallback?.length ?? 0, '| error:', fallbackErr?.message ?? 'none')
    feedData = (fallback ?? []) as unknown[]
  }

  // ── My requests ────────────────────────────────────────────────────────────
  const { data: myRequestsRaw, error: myReqError } = await supabase
    .from('requests')
    .select(`${FULL_SELECT}, request_offers(id, helper_id, message, counter_budget, requester_counter, status, profiles(name, rating))`)
    .eq('requester_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  console.log('[dashboard] myRequests fetched:', myRequestsRaw?.length ?? 0, '| error:', myReqError?.message ?? 'none')

  let myReqData: unknown[] = myRequestsRaw ?? []
  if (isSchemaErr(myReqError?.message)) {
    const { data: fallback } = await supabase
      .from('requests')
      .select(`${BASE_SELECT}, request_offers(id, helper_id, message, counter_budget, requester_counter, status, profiles(name, rating))`)
      .eq('requester_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50)
    myReqData = (fallback ?? []) as unknown[]
  }

  // ── Remaining parallel queries ─────────────────────────────────────────────
  const [
    { data: myOffersRaw },
    { count: activeCount },
    { count: matchedCount },
    { data: driverRideRaw },
    { data: passengerRidesRaw },
  ] = await Promise.all([
    supabase
      .from('request_offers')
      .select('id, message, counter_budget, requester_counter, status, created_at, requests(id, title, category, urgency, status, budget, location, scheduled_time, created_at, requester_id, is_driver, available_seats, seats_filled, profiles(name, rating))')
      .eq('helper_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).in('status', ['matched', 'completed']),
    // Next ride as driver — only migration-005 columns to avoid schema cache risk
    supabase
      .from('requests')
      .select('title, origin_city, destination_city, scheduled_time, available_seats')
      .eq('requester_id', user!.id)
      .eq('category', 'rides')
      .eq('is_driver', true)
      .in('status', ['open', 'matched'])
      .gt('scheduled_time', now)
      .order('scheduled_time', { ascending: true })
      .limit(1),
    // Next ride as confirmed passenger — only migration-005 columns
    supabase
      .from('ride_passengers')
      .select('price_agreed, requests(title, origin_city, destination_city, scheduled_time, available_seats, profiles(name))')
      .eq('passenger_id', user!.id)
      .eq('status', 'confirmed')
      .limit(20),
  ])

  // ── Determine soonest upcoming ride ────────────────────────────────────────
  const nextDriver = (driverRideRaw?.[0] as DriverRideRow | undefined) ?? null
  const paxRides = (passengerRidesRaw ?? []) as unknown as PaxRideRow[]

  const futurePaxRides = paxRides
    .map(p => ({
      price_agreed: p.price_agreed,
      req: (Array.isArray(p.requests) ? p.requests[0] : p.requests) as PaxRideReq | null,
    }))
    .filter((p): p is { price_agreed: number | null; req: PaxRideReq } =>
      p.req != null && !!p.req.scheduled_time && new Date(p.req.scheduled_time) > new Date()
    )
    .sort((a, b) => new Date(a.req.scheduled_time!).getTime() - new Date(b.req.scheduled_time!).getTime())

  const nextPax = futurePaxRides[0] ?? null

  const nextRide: NextRideInfo | null = (() => {
    const driverT = nextDriver?.scheduled_time ? new Date(nextDriver.scheduled_time).getTime() : Infinity
    const paxT = nextPax?.req.scheduled_time ? new Date(nextPax.req.scheduled_time).getTime() : Infinity
    if (driverT === Infinity && paxT === Infinity) return null

    if (driverT <= paxT && nextDriver) {
      return {
        title: nextDriver.title,
        origin_city: nextDriver.origin_city,
        destination_city: nextDriver.destination_city,
        scheduled_time: nextDriver.scheduled_time,
        available_seats: nextDriver.available_seats,
        role: 'driver' as const,
        price_agreed: null,
        driver_name: null,
      }
    }

    if (nextPax) {
      const driverProfile = Array.isArray(nextPax.req.profiles)
        ? (nextPax.req.profiles[0] ?? null)
        : nextPax.req.profiles
      return {
        title: nextPax.req.title,
        origin_city: nextPax.req.origin_city,
        destination_city: nextPax.req.destination_city,
        scheduled_time: nextPax.req.scheduled_time,
        available_seats: nextPax.req.available_seats,
        role: 'passenger' as const,
        price_agreed: nextPax.price_agreed,
        driver_name: driverProfile?.name ?? null,
      }
    }
    return null
  })()

  return (
    <div className="relative min-h-screen">
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 40% at 30% -10%, rgba(59,130,246,0.07), transparent)',
        }}
      />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-12">
        <RequestInput />

        {/* Stats bar */}
        <div className="mt-10 grid grid-cols-2 gap-3">
          <StatCard label="Active Requests" value={activeCount ?? 0} icon="🟢" />
          <StatCard label="Completed Tasks" value={matchedCount ?? 0} icon="✅" />
        </div>

        {/* My Next Ride widget — only rendered when a ride exists */}
        {nextRide && (
          <div className="mt-6">
            <NextRideWidget nextRide={nextRide} />
          </div>
        )}

        {/* Request feed */}
        <div className="mt-10">
          <RequestFeed
            requests={feedData as unknown as FeedRequest[]}
            myRequests={myReqData as unknown as FeedRequestWithOffers[]}
            myOffers={(myOffersRaw ?? []) as unknown as MyOffer[]}
            currentUserId={user!.id}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="group rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-4 transition-colors hover:border-blue-500/20">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold text-white tabular-nums">{value.toLocaleString()}</p>
        <span className="text-lg opacity-60">{icon}</span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500 leading-tight">{label}</p>
    </div>
  )
}

// ─── Next Ride widget ─────────────────────────────────────────────────────────

function NextRideWidget({ nextRide }: { nextRide: NextRideInfo }) {
  const formattedTime = nextRide.scheduled_time
    ? new Date(nextRide.scheduled_time).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  const isDriver = nextRide.role === 'driver'

  return (
    <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">🚗 Your Next Ride</span>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            isDriver
              ? 'text-blue-300 bg-blue-900/40 border-blue-800/50'
              : 'text-purple-300 bg-purple-900/40 border-purple-800/50'
          }`}
        >
          {isDriver ? 'Driver' : 'Passenger'}
        </span>
      </div>

      {nextRide.origin_city && nextRide.destination_city ? (
        <p className="text-base font-semibold text-white mb-2">
          {nextRide.origin_city}
          <span className="mx-2 text-slate-500">→</span>
          {nextRide.destination_city}
        </p>
      ) : (
        <p className="text-[15px] font-semibold text-white mb-2 leading-snug">{nextRide.title}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
        {formattedTime && <span>🕐 {formattedTime}</span>}
        {isDriver && nextRide.available_seats != null && (
          <span>
            {nextRide.available_seats} seat{nextRide.available_seats !== 1 ? 's' : ''} available
          </span>
        )}
        {!isDriver && nextRide.price_agreed != null && (
          <span className="text-emerald-400">💵 ${nextRide.price_agreed} / seat agreed</span>
        )}
        {!isDriver && nextRide.driver_name && (
          <span>
            Driver: <span className="text-slate-300">{nextRide.driver_name}</span>
          </span>
        )}
      </div>

      <Link
        href="/dashboard/rides"
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
      >
        View on Rides page →
      </Link>
    </div>
  )
}
