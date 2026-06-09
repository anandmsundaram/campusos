import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getRequestLifecycleState, getOfferLifecycleState, type OfferSummary } from '@/lib/marketplaceLifecycle'

// ─── Range helpers ────────────────────────────────────────────────────────────

type RangeKey = 'month' | '30d' | '3mo' | '12mo'

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '30d',   label: 'Last 30 days' },
  { key: '3mo',   label: 'Last 3 months' },
  { key: '12mo',  label: 'Last 12 months' },
]

function getRangeStart(range: RangeKey): Date {
  const now = new Date()
  switch (range) {
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1)
    case '30d':   return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '3mo':   return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case '12mo':  return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
  }
}

function getRangeLabel(range: RangeKey): string {
  return RANGE_OPTIONS.find(o => o.key === range)?.label ?? 'This month'
}

// ─── View param ───────────────────────────────────────────────────────────────

type ViewKey = 'you-could-earn' | 'earned' | 'to-pay' | 'open-nearby'
const VALID_VIEWS: readonly ViewKey[] = ['you-could-earn', 'earned', 'to-pay', 'open-nearby']

function parseView(raw: string | undefined): ViewKey | null {
  if (VALID_VIEWS.includes(raw as ViewKey)) return raw as ViewKey
  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReqOffer {
  id: string
  status: string
  counter_budget: number | null
  requester_counter: number | null
  final_agreed_price: number | null
  seats_requested: number | null
}

interface RequestRow {
  id: string
  category: string
  title: string
  status: string
  budget: number | null
  is_driver: boolean | null
  created_at: string
  scheduled_time: string | null
  flexible_time: boolean | null
  request_offers: ReqOffer[] | null
}

interface OfferReqRef {
  id: string
  title: string
  category: string
  status: string
  budget: number | null
  is_driver: boolean | null
  scheduled_time: string | null
  flexible_time: boolean | null
  created_at: string
}

interface OfferRow {
  id: string
  status: string
  created_at: string
  counter_budget: number | null
  requester_counter: number | null
  final_agreed_price: number | null
  seats_requested: number | null
  requests: OfferReqRef | OfferReqRef[] | null
}

// ─── Price helper ─────────────────────────────────────────────────────────────

function offerPrice(o: { final_agreed_price: number | null; requester_counter: number | null; counter_budget: number | null; seats_requested: number | null }, budget: number | null): number {
  const unit = (o.final_agreed_price ?? o.requester_counter ?? o.counter_budget ?? budget) ?? 0
  return unit * (o.seats_requested ?? 1)
}

// ─── Category label ───────────────────────────────────────────────────────────

function catLabel(category: string): string {
  switch (category) {
    case 'rides': return 'Ride'
    case 'peer_help': return 'Peer help'
    case 'errand': return 'Errand'
    case 'tutoring': return 'Tutoring'
    default: return category
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ActivityPageProps {
  searchParams: Promise<{ range?: string; view?: string; filter?: string }>
}

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const params = await searchParams
  const rawRange = params.range ?? 'month'
  const range: RangeKey = (['month', '30d', '3mo', '12mo'] as const).includes(rawRange as RangeKey)
    ? (rawRange as RangeKey)
    : 'month'
  const view = parseView(params.view)
  const filterState = params.filter ?? null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rangeStart = getRangeStart(range)
  const rangeStartIso = rangeStart.toISOString()

  // ── Fetch my requests in range ────────────────────────────────────────────
  const { data: myRequestsRaw } = await supabase
    .from('requests')
    .select('id, category, title, status, budget, is_driver, created_at, scheduled_time, flexible_time, request_offers(id, status, counter_budget, requester_counter, final_agreed_price, seats_requested)')
    .eq('requester_id', user.id)
    .gte('created_at', rangeStartIso)
    .order('created_at', { ascending: false })
    .limit(200)

  // ── Fetch my offers in range ──────────────────────────────────────────────
  const { data: myOffersRaw } = await supabase
    .from('request_offers')
    .select('id, status, created_at, counter_budget, requester_counter, final_agreed_price, seats_requested, requests(id, title, category, status, budget, is_driver, scheduled_time, flexible_time, created_at)')
    .eq('helper_id', user.id)
    .gte('created_at', rangeStartIso)
    .order('created_at', { ascending: false })
    .limit(200)

  const myRequests = (myRequestsRaw ?? []) as RequestRow[]
  const myOffers = (myOffersRaw ?? []) as OfferRow[]

  // ── Compute request lifecycle stats ───────────────────────────────────────

  type ReqState = keyof typeof reqByState
  const reqByState = {
    open_no_offers: 0,
    open_with_offers: 0,
    accepted_upcoming: 0,
    accepted_past_due: 0,
    completed: 0,
    expired_no_offers: 0,
    expired_with_unaccepted_offers: 0,
    cancelled: 0,
  }
  // Detail records per state
  const reqRecords: Record<string, RequestRow[]> = {}

  let owed = 0
  let completedPaid = 0

  for (const r of myRequests) {
    if (r.is_driver === true) continue // driver requests are earnings, not obligations
    const offers = r.request_offers ?? []
    const summary: OfferSummary = {
      pendingCount: offers.filter(o => o.status === 'pending' || o.status === 'countered').length,
      acceptedCount: offers.filter(o => o.status === 'accepted').length,
      totalCount: offers.length,
    }
    const state = getRequestLifecycleState(r, summary) as ReqState
    reqByState[state] = (reqByState[state] ?? 0) + 1
    if (!reqRecords[state]) reqRecords[state] = []
    reqRecords[state].push(r)

    for (const o of offers) {
      if (o.status !== 'accepted') continue
      const total = offerPrice(o, r.budget)
      if (state === 'completed') completedPaid += total
      else if (state === 'accepted_upcoming' || state === 'accepted_past_due') owed += total
    }
  }

  // ── Compute offer lifecycle stats ─────────────────────────────────────────

  type OfferState = keyof typeof offerByState
  const offerByState = {
    pending_open: 0,
    pending_expired: 0,
    accepted_upcoming: 0,
    accepted_past_due: 0,
    completed: 0,
    declined: 0,
    not_selected: 0,
    cancelled: 0,
  }
  const offerRecords: Record<string, OfferRow[]> = {}

  let earned = 0
  let pendingEarnings = 0

  for (const o of myOffers) {
    const req = Array.isArray(o.requests) ? o.requests[0] : o.requests
    if (!req) continue
    if (req.is_driver === true) continue // passenger seat offers — not helper earnings
    const state = getOfferLifecycleState(o.status, req) as OfferState
    offerByState[state] = (offerByState[state] ?? 0) + 1
    if (!offerRecords[state]) offerRecords[state] = []
    offerRecords[state].push(o)

    const total = offerPrice(o, req.budget)
    if (state === 'completed') earned += total
    else if (state === 'accepted_upcoming' || state === 'accepted_past_due') pendingEarnings += total
    else if (state === 'pending_open') pendingEarnings += total  // include pending/countered in pipeline
  }

  const rangeLabel = getRangeLabel(range)
  const rangeParam = `range=${range}`

  // ── Section order driven by view param ───────────────────────────────────
  const offersFirst = view === 'you-could-earn' || view === 'earned'
  const requestsFirst = view === 'to-pay' || view === 'open-nearby'
  const highlightOffers = offersFirst
  const highlightRequests = requestsFirst

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Activity</h1>
          <p className="text-sm text-slate-500 mt-0.5">{rangeLabel}</p>
        </div>
        <Link href="/dashboard" className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
          ← Back to dashboard
        </Link>
      </div>

      {/* Date range filter */}
      <div data-testid="activity-range-filter" className="flex flex-wrap gap-2 mb-8">
        {RANGE_OPTIONS.map(opt => (
          <Link
            key={opt.key}
            href={`/dashboard/activity?range=${opt.key}`}
            data-testid={`range-${opt.key}`}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
              range === opt.key
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* Financial summary */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Finances</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Earned" value={fmtDollars(earned)} sub="as helper (done)" accent="emerald" testId="activity-earned" />
          <StatCard label="In pipeline" value={fmtDollars(pendingEarnings)} sub="pending + active" accent="blue" testId="activity-pipeline" />
          <StatCard label="To pay" value={fmtDollars(owed)} sub="active accepted" accent="orange" testId="activity-to-pay" />
          <StatCard label="Paid out" value={fmtDollars(completedPaid)} sub="completed requests" accent="slate" testId="activity-paid" />
        </div>
        <p className="mt-2 text-[10px] text-slate-400 text-right">Pay each other directly — Venmo, Zelle, or cash</p>
      </section>

      {/* Sections — order driven by view param */}
      {offersFirst ? (
        <>
          <OffersSection offerByState={offerByState} offerRecords={offerRecords} rangeParam={rangeParam} filterState={filterState} highlight={highlightOffers} />
          <div className="mt-8">
            <RequestsSection reqByState={reqByState} reqRecords={reqRecords} rangeParam={rangeParam} filterState={filterState} highlight={highlightRequests} />
          </div>
        </>
      ) : (
        <>
          <RequestsSection reqByState={reqByState} reqRecords={reqRecords} rangeParam={rangeParam} filterState={filterState} highlight={highlightRequests} />
          <div className="mt-8">
            <OffersSection offerByState={offerByState} offerRecords={offerRecords} rangeParam={rangeParam} filterState={filterState} highlight={highlightOffers} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Requests section ─────────────────────────────────────────────────────────

function RequestsSection({ reqByState, reqRecords, rangeParam, filterState, highlight }: {
  reqByState: Record<string, number>
  reqRecords: Record<string, RequestRow[]>
  rangeParam: string
  filterState: string | null
  highlight: boolean
}) {
  const rows: { state: string; label: string; accent?: 'emerald' | 'amber' }[] = [
    { state: 'open_no_offers',                  label: 'Open — no offers yet' },
    { state: 'open_with_offers',                label: 'Open — offers pending',           accent: 'amber' },
    { state: 'accepted_upcoming',               label: 'Accepted (upcoming)',              accent: 'emerald' },
    { state: 'accepted_past_due',               label: 'Accepted (past due)',              accent: 'amber' },
    { state: 'completed',                       label: 'Completed',                        accent: 'emerald' },
    { state: 'expired_no_offers',               label: 'Expired — no offers' },
    { state: 'expired_with_unaccepted_offers',  label: 'Expired — offers declined' },
    { state: 'cancelled',                       label: 'Cancelled' },
  ]

  const activeFilter = filterState && rows.some(r => r.state === filterState) ? filterState : null

  return (
    <section id="requests" data-testid="activity-requests-breakdown">
      <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${highlight ? 'text-blue-700' : 'text-slate-700'}`}>
        My Requests
      </h2>
      <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
        {rows.map(({ state, label, accent }) => {
          const count = reqByState[state] ?? 0
          if (count === 0) return null
          const isActive = activeFilter === state
          return (
            <div key={state}>
              <Link
                href={`/dashboard/activity?${rangeParam}&filter=${isActive ? '' : state}${isActive ? '' : `#requests`}`}
                className={`flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors ${isActive ? 'bg-slate-50' : ''}`}
              >
                <span className={`text-sm ${isActive ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</span>
                <span className={`text-sm tabular-nums ${
                  accent === 'emerald' ? 'text-emerald-600 font-semibold'
                  : accent === 'amber' ? 'text-amber-600 font-semibold'
                  : 'text-slate-700'
                }`}>{count}</span>
              </Link>
              {isActive && reqRecords[state] && reqRecords[state].length > 0 && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {reqRecords[state].map(r => <RequestDetailRow key={r.id} r={r} />)}
                </div>
              )}
            </div>
          )
        })}
        {rows.every(({ state }) => (reqByState[state] ?? 0) === 0) && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">No requests in this period</div>
        )}
      </div>
    </section>
  )
}

// ─── Offers section ───────────────────────────────────────────────────────────

function OffersSection({ offerByState, offerRecords, rangeParam, filterState, highlight }: {
  offerByState: Record<string, number>
  offerRecords: Record<string, OfferRow[]>
  rangeParam: string
  filterState: string | null
  highlight: boolean
}) {
  const rows: { state: string; label: string; accent?: 'emerald' | 'amber' }[] = [
    { state: 'pending_open',      label: 'Pending — awaiting response' },
    { state: 'pending_expired',   label: 'Expired — request closed' },
    { state: 'accepted_upcoming', label: 'Accepted (upcoming)',         accent: 'emerald' },
    { state: 'accepted_past_due', label: 'Accepted (past due)',         accent: 'amber' },
    { state: 'completed',         label: 'Completed',                   accent: 'emerald' },
    { state: 'declined',          label: 'Declined' },
    { state: 'not_selected',      label: 'Not selected' },
    { state: 'cancelled',         label: 'Cancelled' },
  ]

  const activeFilter = filterState && rows.some(r => r.state === filterState) ? filterState : null

  return (
    <section id="offers" data-testid="activity-offers-breakdown">
      <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${highlight ? 'text-blue-700' : 'text-slate-700'}`}>
        My Offers (as helper)
      </h2>
      <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
        {rows.map(({ state, label, accent }) => {
          const count = offerByState[state] ?? 0
          if (count === 0) return null
          const isActive = activeFilter === state
          return (
            <div key={state}>
              <Link
                href={`/dashboard/activity?${rangeParam}&filter=${isActive ? '' : state}${isActive ? '' : `#offers`}`}
                className={`flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors ${isActive ? 'bg-slate-50' : ''}`}
              >
                <span className={`text-sm ${isActive ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</span>
                <span className={`text-sm tabular-nums ${
                  accent === 'emerald' ? 'text-emerald-600 font-semibold'
                  : accent === 'amber' ? 'text-amber-600 font-semibold'
                  : 'text-slate-700'
                }`}>{count}</span>
              </Link>
              {isActive && offerRecords[state] && offerRecords[state].length > 0 && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {offerRecords[state].map(o => <OfferDetailRow key={o.id} o={o} />)}
                </div>
              )}
            </div>
          )
        })}
        {rows.every(({ state }) => (offerByState[state] ?? 0) === 0) && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">No offers made in this period</div>
        )}
      </div>
    </section>
  )
}

// ─── Detail rows ──────────────────────────────────────────────────────────────

function RequestDetailRow({ r }: { r: RequestRow }) {
  const acceptedOffer = r.request_offers?.find(o => o.status === 'accepted')
  const price = acceptedOffer
    ? offerPrice(acceptedOffer, r.budget)
    : r.budget ?? 0

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60">
      <div className="min-w-0 pr-3">
        <p className="text-xs font-medium text-slate-800 truncate">{r.title}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{catLabel(r.category)}</p>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-slate-600">
        {price > 0 ? fmtDollars(price) : '—'}
      </span>
    </div>
  )
}

function OfferDetailRow({ o }: { o: OfferRow }) {
  const req = Array.isArray(o.requests) ? o.requests[0] : o.requests
  if (!req) return null
  const price = offerPrice(o, req.budget)

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/60">
      <div className="min-w-0 pr-3">
        <p className="text-xs font-medium text-slate-800 truncate">{req.title}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{catLabel(req.category)}</p>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-slate-600">
        {price > 0 ? fmtDollars(price) : '—'}
      </span>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function fmtDollars(n: number) {
  if (n === 0) return '$0'
  return n % 1 === 0 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`
}

function StatCard({ label, value, sub, accent, testId }: {
  label: string; value: string; sub: string; accent: 'emerald' | 'blue' | 'orange' | 'slate'; testId: string
}) {
  const styles = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    blue:    'border-blue-200 bg-blue-50 text-blue-600',
    orange:  'border-orange-200 bg-orange-50 text-orange-600',
    slate:   'border-slate-200 bg-slate-50 text-slate-600',
  }[accent]
  return (
    <div className={`rounded-xl border ${styles} px-4 py-3`}>
      <p data-testid={testId} className="text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-slate-700 leading-tight">{label}</p>
      <p className="text-[10px] text-slate-400 leading-tight">{sub}</p>
    </div>
  )
}
