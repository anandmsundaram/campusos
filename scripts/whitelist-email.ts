/**
 * Add a non-.edu email to the signup whitelist.
 * Usage: npx tsx scripts/whitelist-email.ts user@example.com "reason"
 *
 * Requires .env.test.local with E2E_SUPABASE_SERVICE_KEY set,
 * OR set SUPABASE_SERVICE_KEY directly in the environment.
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../.env.test.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

async function main() {
  const email  = process.argv[2]
  const reason = process.argv[3] ?? 'beta_tester'

  if (!email) {
    console.error('Usage: npx tsx scripts/whitelist-email.ts user@example.com "reason"')
    process.exit(1)
  }

  const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.E2E_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SERVICE_KEY')

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { error } = await db
    .from('email_whitelist')
    .upsert({ email: email.trim().toLowerCase(), reason }, { onConflict: 'email' })

  if (error) throw error
  console.log(`Whitelisted: ${email} (${reason})`)
}

main().catch(err => { console.error(err); process.exit(1) })
