import bcrypt from 'bcryptjs'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SPECIAL_CHAR_RE = /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/
const PASSWORD_HISTORY_LIMIT = 5
const BCRYPT_ROUNDS = 12

function validateStrength(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.'
  if (!SPECIAL_CHAR_RE.test(password)) return 'Password must contain at least one special character.'
  return null
}

export async function POST(request: NextRequest) {
  let password: string
  try {
    const body = await request.json()
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // 1. Strength check
  const strengthError = validateStrength(password)
  if (strengthError) {
    return NextResponse.json({ error: strengthError }, { status: 400 })
  }

  const supabase = await createClient()

  // 2. Require an authenticated (recovery) session
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json(
      { error: 'Session expired. Please request a new reset link.' },
      { status: 401 }
    )
  }

  // 3. Check against last 5 stored hashes
  const { data: history } = await supabase
    .from('password_history')
    .select('password_hash')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(PASSWORD_HISTORY_LIMIT)

  for (const row of history ?? []) {
    const reused = await bcrypt.compare(password, row.password_hash)
    if (reused) {
      return NextResponse.json(
        { error: 'You cannot reuse one of your last 5 passwords. Please choose a different password.' },
        { status: 400 }
      )
    }
  }

  // 4. Update the password via Supabase Auth
  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 5. Save new hash to history
  const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  await supabase.from('password_history').insert({
    user_id: user.id,
    password_hash: newHash,
  })

  return NextResponse.json({ ok: true })
}
