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
    .select('name')
    .eq('id', user.id)
    .single()

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
        logout={logout}
      />
      {/* Offset by sidebar on desktop; pad bottom for mobile nav */}
      <div className="md:ml-60 pb-20 md:pb-0">
        {children}
      </div>
    </div>
  )
}
