import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AdminRole = 'campus_admin' | 'global_admin'

export interface AdminScope {
  role: AdminRole
  /** Own campus id for campus_admin; null for global_admin (sees all). */
  campusId: string | null
  userId: string
}

/**
 * Returns the calling user's admin scope, or null if they are not an admin.
 * Server-only — reads the profiles table via the RLS-aware client.
 */
export async function getAdminScope(): Promise<AdminScope | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('admin_role, campus_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  const role = profile.admin_role as string
  if (role !== 'campus_admin' && role !== 'global_admin') return null

  return {
    role: role as AdminRole,
    campusId: (profile.campus_id as string | null) ?? null,
    userId: user.id,
  }
}

/**
 * Redirects to /dashboard when the current user is not an admin.
 * Returns AdminScope when access is granted.
 */
export async function requireAdmin(): Promise<AdminScope> {
  const scope = await getAdminScope()
  if (!scope) redirect('/dashboard')
  return scope
}

/**
 * Like requireAdmin but also verifies the caller can administer the given
 * campus. campus_admin is rejected unless their own campus matches.
 */
export async function requireCampusAdminAccess(targetCampusId: string): Promise<AdminScope> {
  const scope = await requireAdmin()
  if (scope.role === 'global_admin') return scope
  if (scope.campusId !== targetCampusId) redirect('/dashboard')
  return scope
}
