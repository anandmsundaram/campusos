import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getRequestLifecycleState, getOfferLifecycleState, type OfferSummary } from '@/lib/marketplaceLifecycle'

// ─── Date range helpers ────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ActivityPageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const params = await searchParams
  const rawRange = params.range ?? 'month'
  const range: RangeKey = (['month', '30d', '3mo', '12mo'] as const).includes(rawRange as RangeKey)
    ? (rawRange as RangeKey)
    : 'month'

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
    .select('id, status, created_at, counter_budget, requester_counter, final_agreed_price, seats_requested, requests(id, status, budget, is_driver, scheduled_time, flexible_time, created_at)')
    .eq('helper_id', user.id)
    .gte('created_at', rangeStartIso)
    .order('created_at', { ascending: false })
    .limit(200)

  const myRequests = (myRequestsRaw ?? []) as RequestRow[]
  const myOffers = (myOffersRaw ?? []) as OfferRow[]

  // ── Compute lifecycle-driven stats ────────────────────────────────────────

  // Requests I posted — grouped by lifecycle state
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

  let owed = 0
  let toPay = 0
  let completedPaid = 0

  for (const r of myRequests) {
    const offers = r.request_offers ?? []
    const summary: OfferSummary = {
      pendingCount: offers.filter(o => o.status === 'pending' || o.status === 'countered').length,
      acceptedCount: offers.filter(o => o.status === 'accepted').length,
      totalCount: offers.length,
    }
    const state = getRequestLifecycleState(r, summary)
    reqByState[state] = (reqByState[state] ?? 0) + 1

    // Financial: what I owe as requester
    for (const o of offers) {
      if (o.status !== 'accepted') continue
      if (r.is_driver === true) continue // driver earns, not pays
      const price = (o.final_agreed_price ?? o.requester_counter ?? o.counter_budget ?? r.budget) ?? 0
      const total = price * (o.seats_requested ?? 1)
      if (state === 'completed') completedPaid += total
      else if (state === 'accepted_upcoming' || state === 'accepted_past_due') owed += total
    }
  }

  // Offers I made — grouped by lifecycle state
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

  let earned = 0
  let pendingEarnings = 0

  for (const o of myOffers) {
    const req = Array.isArray(o.requests) ? o.requests[0] : o.requests
    if (!req) continue
    if (req.is_driver === true) continue // passenger offers — not helper earnings
    const state = getOfferLifecycleState(o.status, req)
    offerByState[state] = (offerByState[state] ?? 0) + 1

    const price = (o.final_agreed_price ?? o.requester_counter ?? o.counter_budget ?? req.budget) ?? 0
    const total = price * (o.seats_requested ?? 1)
    if (state === 'completed') earned += total
    else if (state === 'accepted_upcoming' || state === 'accepted_past_due') pendingEarnings += total
  }

  const rangeLabel = getRangeLabel(range)

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Activity</h1>
          <p className="text-sm text-slate-500 mt-0.5">{rangeLabel}</p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
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
          <StatCard label="Earned" value={fmtDollars(earned)} sub="as helper" accent="emerald" testId="activity-earned" />
          <StatCard label="In pipeline" value={fmtDollars(pendingEarnings)} sub="pending/accepted" accent="blue" testId="activity-pipeline" />
          <StatCard label="To pay" value={fmtDollars(owed)} sub="active accepted" accent="orange" testId="activity-to-pay" />
          <StatCard label="Paid out" value={fmtDollars(completedPaid)} sub="completed requests" accent="slate" testId="activity-paid" />
        </div>
      </section>

      {/* My requests breakdown */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">My Requests</h2>
        <div data-testid="activity-requests-breakdown" className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          <BreakdownRow label="Open — no offers yet" count={reqByState.open_no_offers} />
          <BreakdownRow label="Open — offers pending" count={reqByState.open_with_offers} accent="amber" />
          <BreakdownRow label="Accepted (upcoming)" count={reqByState.accepted_upcoming} accent="emerald" />
          <BreakdownRow label="Accepted (past due)" count={reqByState.accepted_past_due} accent="amber" />
          <BreakdownRow label="Completed" count={reqByState.completed} accent="emerald" />
          <BreakdownRow label="Expired — no offers" count={reqByState.expired_no_offers} />
          <BreakdownRow label="Expired — offers declined" count={reqByState.expired_with_unaccepted_offers} />
          <BreakdownRow label="Cancelled" count={reqByState.cancelled} />
        </div>
      </section>

      {/* My offers breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">My Offers (as helper)</h2>
        <div data-testid="activity-offers-breakdown" className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          <BreakdownRow label="Pending — awaiting response" count={offerByState.pending_open} />
          <BreakdownRow label="Expired — no helper accepted" count={offerByState.pending_expired} />
          <BreakdownRow label="Accepted (upcoming)" count={offerByState.accepted_upcoming} accent="emerald" />
          <BreakdownRow label="Accepted (past due)" count={offerByState.accepted_past_due} accent="amber" />
          <BreakdownRow label="Completed" count={offerByState.completed} accent="emerald" />
          <BreakdownRow label="Declined" count={offerByState.declined} />
          <BreakdownRow label="Not selected" count={offerByState.not_selected} />
          <BreakdownRow label="Cancelled" count={offerByState.cancelled} />
        </div>
      </section>
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

function BreakdownRow({ label, count, accent }: { label: string; count: number; accent?: 'emerald' | 'amber' }) {
  if (count === 0) return null
  const countColor = accent === 'emerald' ? 'text-emerald-600 font-semibold' : accent === 'amber' ? 'text-amber-600 font-semibold' : 'text-slate-700'
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-700">{label}</span>
      <span className={`text-sm tabular-nums ${countColor}`}>{count}</span>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReqOffer {
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
