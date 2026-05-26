import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-guard'

interface ReportRow {
  id: string
  target_type: string
  target_id: string
  reason: string
  details: string | null
  created_at: string
  status: string
  reporter_id: string | null
  profiles: { name: string | null } | { name: string | null }[] | null
}

interface RequestRow {
  id: string
  title: string
  category: string
  status: string
  created_at: string
  requester_id: string
  campus_id: string | null
  profiles: { name: string | null } | { name: string | null }[] | null
}

interface ProfileRow {
  id: string
  name: string | null
  admin_role: string
  campus_id: string | null
  created_at: string
  verification_status: string | null
  rating: number | null
}

interface AuditRow {
  id: string
  event_type: string
  request_id: string | null
  actor_id: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_COLORS: Record<string, string> = {
  open:      'text-green-400 border-green-500/20 bg-green-500/[0.08]',
  matched:   'text-blue-400 border-blue-500/20 bg-blue-500/[0.08]',
  completed: 'text-slate-400 border-slate-500/20 bg-slate-500/[0.08]',
  cancelled: 'text-red-400 border-red-500/20 bg-red-500/[0.08]',
}

const CATEGORY_LABELS: Record<string, string> = {
  rides:       'Ride',
  errand:      'Errand',
  moving:      'Moving',
  peer_help:   'Peer Help',
  borrow:      'Borrow',
  meal_meetup: 'Meal',
  other:       'Other',
}

const REASON_LABELS: Record<string, string> = {
  inappropriate_content: 'Inappropriate content',
  harassment:            'Harassment',
  scam_fraud:            'Scam / fraud',
  safety_concern:        'Safety concern',
  spam:                  'Spam',
  other:                 'Other',
}

const TYPE_LABELS: Record<string, string> = {
  request:        'Request',
  offer:          'Offer',
  user:           'User',
  message_thread: 'Conversation',
}

export default async function AdminPage(props: {
  searchParams: Promise<{ campus?: string }>
}) {
  const scope = await requireAdmin()
  const rawParams = await props.searchParams
  const campusParam = rawParams.campus ?? null

  const supabase = await createClient()
  const isGlobal = scope.role === 'global_admin'

  // campus_admin is always locked to their own campus
  const effectiveCampusId = isGlobal ? campusParam : scope.campusId

  // Campus list for selector / name lookup
  const { data: campusRows } = await supabase
    .from('campuses').select('id, name, slug').order('name')
  const campuses = campusRows ?? []
  const campusMap = Object.fromEntries(campuses.map(c => [c.id, c.name]))
  const activeCampusName = effectiveCampusId ? (campusMap[effectiveCampusId] ?? 'Unknown') : null

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── System health (campus-scoped) ─────────────────────────────────────────
  const [
    { count: totalUsers },
    { count: totalRequests },
    { count: totalRides },
    { count: totalOffers },
    { count: activeRides },
    { count: completedTasks },
  ] = await Promise.all([
    (() => {
      const q = supabase.from('profiles').select('*', { count: 'exact', head: true })
      return effectiveCampusId ? q.eq('campus_id', effectiveCampusId) : q
    })(),
    (() => {
      const q = supabase.from('requests').select('*', { count: 'exact', head: true })
      return effectiveCampusId ? q.eq('campus_id', effectiveCampusId) : q
    })(),
    (() => {
      const q = supabase.from('requests').select('*', { count: 'exact', head: true }).eq('category', 'rides')
      return effectiveCampusId ? q.eq('campus_id', effectiveCampusId) : q
    })(),
    supabase.from('request_offers').select('*', { count: 'exact', head: true }),
    (() => {
      const q = supabase.from('requests').select('*', { count: 'exact', head: true })
        .eq('category', 'rides').eq('status', 'open')
      return effectiveCampusId ? q.eq('campus_id', effectiveCampusId) : q
    })(),
    (() => {
      const q = supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'completed')
      return effectiveCampusId ? q.eq('campus_id', effectiveCampusId) : q
    })(),
  ])

  const platformStats = [
    { label: 'Total Users',      value: totalUsers      ?? 0, icon: '👥' },
    { label: 'Total Requests',   value: totalRequests   ?? 0, icon: '📋' },
    { label: 'Total Rides',      value: totalRides      ?? 0, icon: '🚗' },
    { label: 'Offers Made',      value: totalOffers     ?? 0, icon: '🤝' },
    { label: 'Active Rides',     value: activeRides     ?? 0, icon: '🟢' },
    { label: 'Tasks Completed',  value: completedTasks  ?? 0, icon: '✅' },
  ]

  // ── Analytics funnel + engagement (global_admin only — RLS blocks campus_admin) ──
  let funnelSteps: { label: string; value: number; event: string }[] = []
  let engagementStats: { label: string; value: number; icon: string }[] = []

  if (isGlobal) {
    const [
      { count: evLanding }, { count: evSignupStarted },
      { count: evSignupCompleted }, { count: evDashboard },
      { count: evRides }, { count: evMessages }, { count: evNotifs },
      { count: evOffers }, { count: evRequests }, { count: evOnboarding },
    ] = await Promise.all([
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'landing_page_view').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'signup_started').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'signup_completed').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'dashboard_opened').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'rides_page_opened').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'messages_opened').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'notifications_opened').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'offer_submitted').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'request_created').gte('created_at', sevenDaysAgo),
      supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'onboarding_card_dismissed').gte('created_at', sevenDaysAgo),
    ])

    funnelSteps = [
      { label: 'Landing views',     value: evLanding        ?? 0, event: 'landing_page_view' },
      { label: 'Signup started',    value: evSignupStarted  ?? 0, event: 'signup_started' },
      { label: 'Signup completed',  value: evSignupCompleted ?? 0, event: 'signup_completed' },
      { label: 'Dashboard opened',  value: evDashboard      ?? 0, event: 'dashboard_opened' },
    ]
    engagementStats = [
      { label: 'Rides page',          value: evRides      ?? 0, icon: '🚗' },
      { label: 'Messages opened',     value: evMessages   ?? 0, icon: '💬' },
      { label: 'Notifications',       value: evNotifs     ?? 0, icon: '🔔' },
      { label: 'Offers submitted',    value: evOffers     ?? 0, icon: '🤝' },
      { label: 'Requests created',    value: evRequests   ?? 0, icon: '📋' },
      { label: 'Onboarding dismissed',value: evOnboarding ?? 0, icon: '👋' },
    ]
  }

  // ── Recent requests (campus-scoped) ──────────────────────────────────────
  const requestsQ = supabase
    .from('requests')
    .select('id, title, category, status, created_at, requester_id, campus_id, profiles!requester_id(name)')
    .order('created_at', { ascending: false })
    .limit(25)
  const { data: recentRequests } = await (
    effectiveCampusId ? requestsQ.eq('campus_id', effectiveCampusId) : requestsQ
  ) as { data: RequestRow[] | null; error: unknown }

  // ── Recent users (campus-scoped) ──────────────────────────────────────────
  const usersQ = supabase
    .from('profiles')
    .select('id, name, admin_role, campus_id, created_at, verification_status, rating')
    .order('created_at', { ascending: false })
    .limit(25)
  const { data: recentUsers } = await (
    effectiveCampusId ? usersQ.eq('campus_id', effectiveCampusId) : usersQ
  ) as { data: ProfileRow[] | null; error: unknown }

  // ── Audit events (RLS auto-scopes campus_admin via policy) ────────────────
  const { data: auditEvents } = await supabase
    .from('audit_events')
    .select('id, event_type, request_id, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20) as { data: AuditRow[] | null; error: unknown }

  // ── Reports queue (campus_admin RLS-scoped) ───────────────────────────────
  const { data: recentReports } = await supabase
    .from('reports')
    .select('id, target_type, reason, details, created_at, status, reporter_id, profiles!reporter_id(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(25) as { data: ReportRow[] | null; error: unknown }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-16" data-testid="admin-page">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
            Internal
          </span>
          {isGlobal ? (
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-400" data-testid="role-badge">
              Global Admin
            </span>
          ) : (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400" data-testid="role-badge">
              Campus Admin
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {isGlobal
            ? (activeCampusName ? `Filtered: ${activeCampusName}` : 'Platform-wide view — all campuses')
            : `Scoped to: ${activeCampusName ?? 'your campus'}`}
        </p>
      </div>

      {/* Campus filter — global_admin only */}
      {isGlobal && campuses.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2" data-testid="campus-filter">
          <span className="text-xs text-slate-600 mr-1">Filter campus:</span>
          <Link
            href="/dashboard/admin"
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              !effectiveCampusId
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                : 'border-[#1e2d4a] text-slate-500 hover:text-slate-300'
            }`}
          >
            All
          </Link>
          {campuses.map(c => (
            <Link
              key={c.id}
              href={`/dashboard/admin?campus=${c.id}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                effectiveCampusId === c.id
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                  : 'border-[#1e2d4a] text-slate-500 hover:text-slate-300'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {/* ── Section 1: System health ──────────────────────────────────────── */}
      <section aria-label="System health">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="health-metrics">
          {platformStats.map(s => (
            <div
              key={s.label}
              className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-4 transition-colors hover:border-blue-500/20"
            >
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-white tabular-nums">{s.value.toLocaleString()}</p>
                <span className="text-lg opacity-60">{s.icon}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 2: Onboarding funnel (global_admin only) ────────────── */}
      {isGlobal && funnelSteps.length > 0 && (
        <section className="mt-10" aria-label="Onboarding funnel">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-white">Onboarding Funnel</h2>
            <span className="text-xs text-slate-600">last 7 days</span>
          </div>
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] overflow-hidden">
            {funnelSteps.map((step, i) => {
              const topCount = funnelSteps[0].value
              const pct = topCount > 0 ? Math.round((step.value / topCount) * 100) : 0
              const dropPct = i > 0 && funnelSteps[i - 1].value > 0
                ? Math.round((1 - step.value / funnelSteps[i - 1].value) * 100) : null
              return (
                <div key={step.event} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#1e2d4a] last:border-0">
                  <div className="w-6 text-center text-xs text-slate-600 flex-shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-slate-300">{step.label}</span>
                      <div className="flex items-center gap-3">
                        {dropPct !== null && dropPct > 0 && (
                          <span className="text-[10px] text-red-400">-{dropPct}%</span>
                        )}
                        <span className="text-sm font-bold text-white tabular-nums">{step.value.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-600 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-[#1e2d4a] overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Section 3: Engagement events (global_admin only) ─────────────── */}
      {isGlobal && engagementStats.length > 0 && (
        <section className="mt-8" aria-label="Engagement events">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-white">Engagement Events</h2>
            <span className="text-xs text-slate-600">last 7 days</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {engagementStats.map(s => (
              <div key={s.label} className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-white tabular-nums">{s.value.toLocaleString()}</p>
                  <span className="text-base opacity-50">{s.icon}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 4: Requests moderation ───────────────────────────────── */}
      <section className="mt-10" aria-label="Recent requests" data-testid="requests-section">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-white">Recent Requests</h2>
          <span className="text-xs text-slate-600">last 25</span>
        </div>
        {!recentRequests || recentRequests.length === 0 ? (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-8 text-center">
            <p className="text-sm text-slate-500">No requests found</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2d4a]">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Category</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Title</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Requester</th>
                    {isGlobal && <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Campus</th>}
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((r, i) => {
                    const requesterName = Array.isArray(r.profiles) ? r.profiles[0]?.name : r.profiles?.name
                    return (
                      <tr key={r.id} className={i < recentRequests.length - 1 ? 'border-b border-[#1e2d4a]' : ''}>
                        <td className="px-4 py-3 text-slate-400">{CATEGORY_LABELS[r.category] ?? r.category}</td>
                        <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">{r.title}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? 'text-slate-400 border-slate-500/20 bg-slate-500/[0.08]'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{requesterName ?? '—'}</td>
                        {isGlobal && <td className="px-4 py-3 text-slate-500">{r.campus_id ? (campusMap[r.campus_id] ?? r.campus_id.slice(0, 8)) : '—'}</td>}
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{timeAgo(r.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 5: Users ──────────────────────────────────────────────── */}
      <section className="mt-10" aria-label="Recent users" data-testid="users-section">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-white">Recent Users</h2>
          <span className="text-xs text-slate-600">last 25</span>
        </div>
        {!recentUsers || recentUsers.length === 0 ? (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-8 text-center">
            <p className="text-sm text-slate-500">No users found</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2d4a]">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Role</th>
                    {isGlobal && <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Campus</th>}
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Rating</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map((u, i) => (
                    <tr key={u.id} className={i < recentUsers.length - 1 ? 'border-b border-[#1e2d4a]' : ''}>
                      <td className="px-4 py-3 text-slate-300">{u.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {u.admin_role !== 'user' ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            u.admin_role === 'global_admin'
                              ? 'text-purple-400 border-purple-500/20 bg-purple-500/[0.08]'
                              : 'text-amber-400 border-amber-500/20 bg-amber-500/[0.08]'
                          }`}>
                            {u.admin_role === 'global_admin' ? 'global admin' : 'campus admin'}
                          </span>
                        ) : (
                          <span className="text-slate-600">user</span>
                        )}
                      </td>
                      {isGlobal && <td className="px-4 py-3 text-slate-500">{u.campus_id ? (campusMap[u.campus_id] ?? u.campus_id.slice(0, 8)) : '—'}</td>}
                      <td className="px-4 py-3 text-slate-400">{u.rating != null ? u.rating.toFixed(1) : '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{timeAgo(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 6: Audit events ───────────────────────────────────────── */}
      <section className="mt-10" aria-label="Audit log" data-testid="audit-section">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-white">Audit Log</h2>
          <span className="text-xs text-slate-600">last 20</span>
        </div>
        {!auditEvents || auditEvents.length === 0 ? (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-8 text-center">
            <p className="text-sm text-slate-500">No audit events</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2d4a]">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Event</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Actor</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Request</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">When</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map((e, i) => (
                    <tr key={e.id} className={i < auditEvents.length - 1 ? 'border-b border-[#1e2d4a]' : ''}>
                      <td className="px-4 py-3 text-slate-300 font-mono text-[10px]">{e.event_type}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{e.actor_id ? e.actor_id.slice(0, 8) : '—'}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{e.request_id ? e.request_id.slice(0, 8) : '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{timeAgo(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 7: Reports queue ──────────────────────────────────────── */}
      <section className="mt-10" aria-label="Pending reports" data-testid="reports-section">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-white">Pending Reports</h2>
          {(recentReports?.length ?? 0) > 0 && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
              {recentReports!.length}
            </span>
          )}
        </div>
        {!recentReports || recentReports.length === 0 ? (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-8 text-center">
            <p className="text-sm text-slate-500">No pending reports</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] overflow-hidden">
            {recentReports.map((r, i) => {
              const reporterName = Array.isArray(r.profiles) ? r.profiles[0]?.name : r.profiles?.name
              return (
                <div key={r.id} className={`px-5 py-4 ${i < recentReports.length - 1 ? 'border-b border-[#1e2d4a]' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="rounded-full border border-red-500/20 bg-red-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-red-400">
                          {TYPE_LABELS[r.target_type] ?? r.target_type}
                        </span>
                        <span className="text-xs text-slate-300 font-medium">{REASON_LABELS[r.reason] ?? r.reason}</span>
                      </div>
                      {r.details && (
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{r.details}</p>
                      )}
                      <p className="mt-1.5 text-[10px] text-slate-600">
                        by {reporterName ?? 'Unknown'} · {timeAgo(r.created_at)}
                      </p>
                    </div>
                    <span className="flex-shrink-0 font-mono text-[10px] text-slate-700 break-all max-w-[140px] text-right">
                      {r.target_id.slice(0, 8)}…
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-700">
          To resolve: update report status directly in Supabase.
        </p>
      </section>
    </div>
  )
}
