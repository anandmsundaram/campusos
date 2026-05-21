import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = new Set(['anandmsundaram@gmail.com', 'campusosapp@gmail.com', 'valsgum@gmail.com'])

const FUNNEL_EVENTS = [
  'landing_page_view',
  'signup_started',
  'signup_completed',
  'dashboard_opened',
] as const

const ENGAGEMENT_EVENTS = [
  'rides_page_opened',
  'messages_opened',
  'notifications_opened',
  'offer_submitted',
  'request_created',
  'onboarding_card_dismissed',
] as const

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.has(user.email ?? '')) {
    redirect('/dashboard')
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalUsers },
    { count: totalRequests },
    { count: totalRides },
    { count: totalMessages },
    { count: totalOffers },
    { count: activeRides },
    { count: completedTasks },
    // Analytics funnel counts (7d)
    { count: evLanding },
    { count: evSignupStarted },
    { count: evSignupCompleted },
    { count: evDashboard },
    // Engagement counts (7d)
    { count: evRides },
    { count: evMessages },
    { count: evNotifs },
    { count: evOffers },
    { count: evRequests },
    { count: evOnboarding },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('category', 'rides'),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
    supabase.from('request_offers').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('category', 'rides').eq('status', 'open'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    // Funnel
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'landing_page_view').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'signup_started').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'signup_completed').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'dashboard_opened').gte('created_at', sevenDaysAgo),
    // Engagement
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'rides_page_opened').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'messages_opened').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'notifications_opened').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'offer_submitted').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'request_created').gte('created_at', sevenDaysAgo),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'onboarding_card_dismissed').gte('created_at', sevenDaysAgo),
  ])

  const platformStats = [
    { label: 'Total Users', value: totalUsers ?? 0, icon: '👥' },
    { label: 'Total Requests', value: totalRequests ?? 0, icon: '📋' },
    { label: 'Total Rides', value: totalRides ?? 0, icon: '🚗' },
    { label: 'Messages Sent', value: totalMessages ?? 0, icon: '💬' },
    { label: 'Offers Made', value: totalOffers ?? 0, icon: '🤝' },
    { label: 'Active Rides', value: activeRides ?? 0, icon: '🟢' },
    { label: 'Tasks Completed', value: completedTasks ?? 0, icon: '✅' },
  ]

  const funnelSteps = [
    { label: 'Landing views', value: evLanding ?? 0, event: 'landing_page_view' },
    { label: 'Signup started', value: evSignupStarted ?? 0, event: 'signup_started' },
    { label: 'Signup completed', value: evSignupCompleted ?? 0, event: 'signup_completed' },
    { label: 'Dashboard opened', value: evDashboard ?? 0, event: 'dashboard_opened' },
  ]

  const engagementStats = [
    { label: 'Rides page', value: evRides ?? 0, icon: '🚗' },
    { label: 'Messages opened', value: evMessages ?? 0, icon: '💬' },
    { label: 'Notifications opened', value: evNotifs ?? 0, icon: '🔔' },
    { label: 'Offers submitted', value: evOffers ?? 0, icon: '🤝' },
    { label: 'Requests created', value: evRequests ?? 0, icon: '📋' },
    { label: 'Onboarding dismissed', value: evOnboarding ?? 0, icon: '👋' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-12">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
            Internal
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">Platform-wide stats — visible to admins only</p>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {platformStats.map((s) => (
          <div
            key={s.label}
            className="group rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-4 transition-colors hover:border-blue-500/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-white tabular-nums">{s.value.toLocaleString()}</p>
              <span className="text-lg opacity-60">{s.icon}</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Onboarding funnel — last 7 days */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-white">Onboarding Funnel</h2>
          <span className="text-xs text-slate-600">last 7 days</span>
        </div>
        <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] overflow-hidden">
          {funnelSteps.map((step, i) => {
            const topCount = funnelSteps[0].value
            const pct = topCount > 0 ? Math.round((step.value / topCount) * 100) : 0
            const dropPct = i > 0 && funnelSteps[i - 1].value > 0
              ? Math.round((1 - step.value / funnelSteps[i - 1].value) * 100)
              : null

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
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Engagement events — last 7 days */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-white">Engagement Events</h2>
          <span className="text-xs text-slate-600">last 7 days</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {engagementStats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-3.5"
            >
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-white tabular-nums">{s.value.toLocaleString()}</p>
                <span className="text-base opacity-50">{s.icon}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
