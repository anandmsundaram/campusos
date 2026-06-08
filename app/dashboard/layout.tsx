import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from './Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, admin_role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.admin_role === 'campus_admin' || profile?.admin_role === 'global_admin'

  async function logout() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <Sidebar
        userName={profile?.name ?? null}
        userEmail={user.email ?? ''}
        userId={user.id}
        isAdmin={isAdmin}
        logout={logout}
      />
      {/* Offset by sidebar on desktop; pad bottom for mobile nav */}
      <div className="md:ml-56 pb-20 md:pb-0">
        {children}
      </div>
    </div>
  )
}
