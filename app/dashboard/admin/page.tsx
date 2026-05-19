import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = new Set(['anandmsundaram@gmail.com', 'campusosapp@gmail.com', 'valsgum@gmail.com'])

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.has(user.email ?? '')) {
    redirect('/dashboard')
  }

  const [
    { count: totalUsers },
    { count: totalRequests },
    { count: totalRides },
    { count: totalMessages },
    { count: totalOffers },
    { count: activeRides },
    { count: completedTasks },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('category', 'rides'),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
    supabase.from('request_offers').select('*', { count: 'exact', head: true }),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('category', 'rides').eq('status', 'open'),
    supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
  ])

  const stats = [
    { label: 'Total Users', value: totalUsers ?? 0, icon: '👥' },
    { label: 'Total Requests', value: totalRequests ?? 0, icon: '📋' },
    { label: 'Total Rides', value: totalRides ?? 0, icon: '🚗' },
    { label: 'Messages Sent', value: totalMessages ?? 0, icon: '💬' },
    { label: 'Offers Made', value: totalOffers ?? 0, icon: '🤝' },
    { label: 'Active Rides', value: activeRides ?? 0, icon: '🟢' },
    { label: 'Tasks Completed', value: completedTasks ?? 0, icon: '✅' },
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s) => (
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
    </div>
  )
}
