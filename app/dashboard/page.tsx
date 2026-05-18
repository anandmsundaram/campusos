import { createClient } from '@/lib/supabase/server'
import RequestInput from './RequestInput'
import RequestFeed, { type MyOffer } from './RequestFeed'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [
    { data: requests },
    { data: myOffersRaw },
    { count: activeCount },
    { count: memberCount },
    { count: matchedCount },
  ] = await Promise.all([
    supabase
      .from('requests')
      .select('id, title, category, urgency, location, budget, scheduled_time, created_at, requester_id, profiles(name, rating)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('request_offers')
      .select('id, message, counter_budget, status, created_at, requests(id, title, category, urgency, status, budget, location, scheduled_time, created_at, requester_id, profiles(name, rating))')
      .eq('helper_id', user!.id)
      .order('created_at', { ascending: false }),

    supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open'),

    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true }),

    supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['matched', 'completed']),
  ])

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
        {/* Hero */}
        <RequestInput />

        {/* Stats bar */}
        <div className="mt-10 grid grid-cols-3 gap-3">
          <StatCard label="Active Requests" value={activeCount ?? 0} icon="🟢" />
          <StatCard label="Campus Members" value={memberCount ?? 0} icon="👥" />
          <StatCard label="Tasks Matched" value={matchedCount ?? 0} icon="✅" />
        </div>

        {/* Feed */}
        <div className="mt-10">
          <RequestFeed
            requests={requests ?? []}
            myOffers={(myOffersRaw ?? []) as unknown as MyOffer[]}
            currentUserId={user!.id}
          />
        </div>
      </div>
    </div>
  )
}

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
