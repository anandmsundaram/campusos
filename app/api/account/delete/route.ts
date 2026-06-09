import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST() {
  // 1. Verify the caller is authenticated — read user from server-side session only.
  //    The user id we receive here is the only deletion target; no client-supplied id.
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  // 2. Service role key — server-only, never sent to the browser.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    // Key not configured in this environment. Graceful degradation.
    return NextResponse.json(
      {
        error:
          'Account deletion is temporarily unavailable. Please email campusosapp@gmail.com to request account deletion and we will process it within 48 hours.',
      },
      { status: 503 },
    )
  }

  // 3. Create admin client (service role) — never called from the browser.
  //    Deleting from auth.users cascades to profiles → requests → offers →
  //    messages → notifications → blocks. Audit/report records retain their
  //    rows with actor_id/reporter_id SET NULL for safety audit purposes.
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)

  if (deleteError) {
    return NextResponse.json(
      {
        error:
          'Failed to delete account. Please try again or email campusosapp@gmail.com.',
      },
      { status: 500 },
    )
  }

  // 4. Clear the session cookies so the browser does not hold a stale token.
  await supabase.auth.signOut()

  return NextResponse.json({ success: true })
}
