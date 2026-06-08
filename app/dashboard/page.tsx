import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RequestInput from './RequestInput'
import RequestFeed, { type FeedRequest, type MyOffer, type FeedRequestWithOffers } from './RequestFeed'
import OnboardingCard from './OnboardingCard'
import ActivityPulse from './ActivityPulse'
import ContextualBanner from './ContextualBanner'
import PageTracker from '@/app/components/PageTracker'

function isSchemaErr(msg?: string | null) {
  return !!msg && /schema cache|Could not find the|more than one relationship/i.test(msg)
}

interface CampusRow { id: string; name: string; city: string; slug: string }

// ─── Types for next-ride widget ───────────────────────────────────────────────

interface DriverRideRow {
  title: string
  origin_city: string | null
  destination_city: string | null
  scheduled_time: string | null
  available_seats: number | null
}

interface PaxRideReq {
  id: string
  title: string
  origin_city: string | null
  destination_city: string | null
  scheduled_time: string | null
  available_seats: number | null
  is_driver: boolean | null
  profiles: { name: string | null } | { name: string | null }[] | null
}

// Accepted offer the user made on a driver ride (canonical — from request_offers)
interface PaxRideRow {
  final_agreed_price: number | null
  counter_budget: number | null
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
  structured_data,
  pickup_location, dropoff_location,
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

  // ── Campus context (for campus-scoped feed and display) ───────────────────
  // RLS already enforces campus scoping on all queries; this fetch provides
  // the campus name for UI display and enables the defense-in-depth filter.
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('campus_id, campuses!campus_id(id, name, city, slug)')
    .eq('id', user!.id)
    .single()

  const userCampusId = (profileRow?.campus_id as string | null | undefined) ?? null
  const campusInfo = profileRow
    ? (Array.isArray(profileRow.campuses) ? profileRow.campuses[0] : profileRow.campuses) as CampusRow | null
    : null
  const campusName = campusInfo?.name ?? null

  // ── Auto-complete past rides (1 h after scheduled_time) ──────────────────
  // Threshold: 1 h grace period after ride time, then auto-complete
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()

  // Driver's own rides
  await supabase
    .from('requests')
    .update({ status: 'completed' })
    .in('status', ['open', 'matched'])
    .eq('category', 'rides')
    .eq('requester_id', user!.id)
    .lt('scheduled_time', oneHourAgo)

  // Rides where user is a confirmed passenger — auto-complete using helper RLS (migration 012)
  const { data: paxOffers } = await supabase
    .from('request_offers')
    .select('request_id')
    .eq('helper_id', user!.id)
    .eq('status', 'accepted')
  if (paxOffers && paxOffers.length > 0) {
    await supabase
      .from('requests')
      .update({ status: 'completed' })
      .in('status', ['open', 'matched'])
      .eq('category', 'rides')
      .in('id', paxOffers.map(o => o.request_id))
      .lt('scheduled_time', oneHourAgo)
  }

  // ── Step 1: fetch campus-scoped open requests ────────────────────────────
  // RLS enforces campus_id = viewer's campus; explicit filter adds defense-in-depth.
  // userCampusId may be null pre-migration (migration 030) — skip filter in that case.
  const feedBase = supabase.from('requests').select(FULL_SELECT).eq('status', 'open')
  const { data: requests, error: requestsError } = await (
    userCampusId ? feedBase.eq('campus_id', userCampusId) : feedBase
  ).order('created_at', { ascending: false })

  // STEP 1: Debug logging — visible in the Next.js terminal (server-side)
  console.log('[dashboard] requests fetched:', requests?.length ?? 0, '| error:', requestsError?.message ?? 'none')
  if (requestsError) console.error('[dashboard] full requestsError:', JSON.stringify(requestsError))

  // Schema cache fallback — retry without migration 006/007 columns
  let feedData: unknown[] = requests ?? []
  if (isSchemaErr(requestsError?.message)) {
    const fallbackBase = supabase.from('requests').select(BASE_SELECT).eq('status', 'open')
    const { data: fallback, error: fallbackErr } = await (
      userCampusId ? fallbackBase.eq('campus_id', userCampusId) : fallbackBase
    ).order('created_at', { ascending: false })
    console.log('[dashboard] fallback fetched:', fallback?.length ?? 0, '| error:', fallbackErr?.message ?? 'none')
    feedData = (fallback ?? []) as unknown[]
  }

  // ── My requests ────────────────────────────────────────────────────────────
  const { data: myRequestsRaw, error: myReqError } = await supabase
    .from('requests')
    .select(`${FULL_SELECT}, request_offers(id, helper_id, message, counter_budget, requester_counter, final_agreed_price, seats_requested, status, profiles!helper_id(name, rating))`)
    .eq('requester_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  console.log('[dashboard] myRequests fetched:', myRequestsRaw?.length ?? 0, '| error:', myReqError?.message ?? 'none')

  let myReqData: unknown[] = myRequestsRaw ?? []
  if (isSchemaErr(myReqError?.message)) {
    const { data: fallback } = await supabase
      .from('requests')
      .select(`${BASE_SELECT}, request_offers(id, helper_id, message, counter_budget, requester_counter, final_agreed_price, seats_requested, status, profiles!helper_id(name, rating))`)
      .eq('requester_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50)
    myReqData = (fallback ?? []) as unknown[]
  }

  // ── Activity pulse counts ──────────────────────────────────────────────────
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const dayAgo  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // ── Remaining parallel queries ─────────────────────────────────────────────
  const [
    { data: myOffersRaw },
    { data: driverRideRaw },
    { data: passengerRidesRaw },
    { count: completedThisWeek },
    { count: helpedToday },
  ] = await Promise.all([
    supabase
      .from('request_offers')
      .select('id, message, counter_budget, requester_counter, final_agreed_price, seats_requested, status, confirmed_completion, created_at, requests(id, title, category, urgency, status, budget, location, scheduled_time, created_at, requester_id, is_driver, available_seats, seats_filled, structured_data, profiles!requester_id(name, rating))')
      .eq('helper_id', user!.id)
      .order('created_at', { ascending: false }),
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
    // Next ride as accepted passenger — canonical: accepted request_offers on driver rides
    supabase
      .from('request_offers')
      .select('final_agreed_price, counter_budget, requests(id, title, origin_city, destination_city, scheduled_time, available_seats, is_driver, profiles!requester_id(name))')
      .eq('helper_id', user!.id)
      .eq('status', 'accepted')
      .limit(20),
    // Activity pulse: requests completed this week
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', weekAgo),
    // Activity pulse: offers accepted today (proxy for "students helped")
    supabase
      .from('request_offers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .gte('created_at', dayAgo),
  ])

  // ── Determine soonest upcoming ride ────────────────────────────────────────
  const nextDriver = (driverRideRaw?.[0] as DriverRideRow | undefined) ?? null
  const paxRides = (passengerRidesRaw ?? []) as unknown as PaxRideRow[]

  const futurePaxRides = paxRides
    .map(p => ({
      price_agreed: p.final_agreed_price ?? p.counter_budget,
      req: (Array.isArray(p.requests) ? p.requests[0] : p.requests) as PaxRideReq | null,
    }))
    .filter((p): p is { price_agreed: number | null; req: PaxRideReq } =>
      p.req != null &&
      p.req.is_driver === true &&   // only driver rides (not passenger-posted requests)
      !!p.req.scheduled_time &&
      new Date(p.req.scheduled_time) > new Date()
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

  // ── Financial summary (derived from already-fetched data) ─────────────────
  // Who earns vs pays:
  //   Driver (requester, is_driver=true)  → EARNS from passengers
  //   Passenger (offer on is_driver=true) → PAYS the driver
  //   Task requester                      → PAYS the helper
  //   Helper/driver (offer on non-driver) → EARNS from requester
  interface FinOffer {
    status: string
    counter_budget: number | null
    requester_counter: number | null
    final_agreed_price?: number | null
    seats_requested: number | null
    requests: { status: string; budget: number | null; is_driver?: boolean | null } | { status: string; budget: number | null; is_driver?: boolean | null }[] | null
  }
  interface FinReq {
    status: string
    budget: number | null
    is_driver?: boolean | null
    request_offers?: { status: string; counter_budget: number | null; requester_counter: number | null; final_agreed_price?: number | null; seats_requested: number | null }[]
  }

  let committed = 0, earned = 0, owed = 0

  // Offers I made on OTHERS' requests (I am the helper or the passenger)
  for (const o of (myOffersRaw ?? []) as FinOffer[]) {
    if (o.status !== 'accepted') continue
    const req = Array.isArray(o.requests) ? o.requests[0] : o.requests
    if (!req) continue
    const price = (o.final_agreed_price ?? o.requester_counter ?? o.counter_budget ?? req.budget) ?? 0
    const total = price * (o.seats_requested ?? 1)

    if (req.is_driver === true) {
      // I booked seats as a PASSENGER → I owe the driver; only count active rides
      if (req.status === 'open' || req.status === 'matched') owed += total
    } else {
      // I am the HELPER (task or driving for a ride-seeker) → I earn
      if (req.status === 'completed') earned += total
      else if (req.status === 'open' || req.status === 'matched') committed += total
    }
  }

  // My OWN requests (I am the requester/driver/poster)
  for (const r of myReqData as FinReq[]) {
    for (const o of r.request_offers ?? []) {
      if (o.status !== 'accepted') continue
      const price = (o.final_agreed_price ?? o.requester_counter ?? o.counter_budget ?? r.budget) ?? 0
      const total = price * (o.seats_requested ?? 1)

      if (r.is_driver === true) {
        // I am the DRIVER — passengers pay me
        if (r.status === 'completed') earned += total
        else if (r.status === 'open' || r.status === 'matched') committed += total
      } else {
        // I am a task requester — I pay helpers
        if (r.status === 'open' || r.status === 'matched') owed += total
      }
    }
  }

  // Open requests = MY own open/matched requests (not a global count)
  const openRequests = (myReqData as FinReq[]).filter(r => r.status === 'open' || r.status === 'matched').length

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
        <PageTracker event="dashboard_opened" />
        {campusName ? (
          <div data-testid="campus-badge" className="mb-3 flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Campus</span>
            <span className="rounded-full border border-blue-800/50 bg-blue-900/30 px-3 py-0.5 text-xs font-medium text-blue-300">
              {campusName}
            </span>
          </div>
        ) : userCampusId === null && profileRow !== null && profileRow !== undefined ? (
          // Post-migration: profile exists but campus_id is null — data integrity issue
          <div className="mb-3 rounded-lg border border-orange-800/40 bg-orange-900/20 px-4 py-2">
            <p className="text-xs text-orange-300">
              Your campus is not set. Please contact support or complete setup.
            </p>
          </div>
        ) : null}
        <RequestInput />

        {/* First-session onboarding card — client component, dismisses via localStorage */}
        <OnboardingCard />

        {/* Finance strip */}
        <div className="mt-6">
          <FinanceStrip committed={committed} earned={earned} owed={owed} openRequests={openRequests} />
        </div>

        {/* My Next Ride widget — only rendered when a ride exists */}
        {nextRide && (
          <div className="mt-6">
            <NextRideWidget nextRide={nextRide} />
          </div>
        )}

        {/* Activity pulse + contextual banner */}
        <div className="mt-4">
          <ActivityPulse
            openCount={feedData.length}
            completedThisWeek={completedThisWeek ?? 0}
            helpedToday={helpedToday ?? 0}
          />
          <ContextualBanner />
        </div>

        {/* Request feed */}
        <div className="mt-2">
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

// ─── Finance strip ────────────────────────────────────────────────────────────

function fmtDollars(n: number) {
  if (n === 0) return '$0'
  return n % 1 === 0 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`
}

function FinanceStrip({ committed, earned, owed, openRequests }: {
  committed: number; earned: number; owed: number; openRequests: number
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <FinStat label="Committed" sub="pending earnings" value={fmtDollars(committed)} dim={committed === 0} accent="emerald" testId="fin-in-play" />
        <FinStat label="Earned" sub="as helper" value={fmtDollars(earned)} dim={earned === 0} accent="blue" testId="fin-earned" />
        <FinStat label="To Pay" sub="you owe" value={fmtDollars(owed)} dim={owed === 0} accent="orange" testId="fin-to-pay" />
        <FinStat label="Open Requests" sub="awaiting match" value={openRequests.toLocaleString()} dim={openRequests === 0} accent="slate" testId="fin-active" />
      </div>
      <p className="text-[10px] text-slate-700 text-right leading-tight px-0.5">
        Payments handled directly between students (Venmo, Zelle, cash, etc.)
      </p>
    </div>
  )
}

function FinStat({ label, sub, value, dim, accent, testId }: {
  label: string; sub: string; value: string; dim: boolean; accent: 'emerald' | 'blue' | 'orange' | 'slate'; testId: string
}) {
  const valueColor = dim ? 'text-slate-600' : {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    slate: 'text-white',
  }[accent]
  return (
    <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-3">
      <p data-testid={testId} className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-400 leading-tight">{label}</p>
      <p className="text-[10px] text-slate-600 leading-tight">{sub}</p>
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
