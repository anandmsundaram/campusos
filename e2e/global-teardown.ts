/**
 * Global teardown — runs once after the entire test suite.
 * Deletes all E2E-tagged rows from the database.
 */

import { FullConfig } from '@playwright/test'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env.test.local') })

async function teardown(_config: FullConfig) {
  const supabaseUrl = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.from('requests').delete().like('title', '[E2E-%')
  if (error) console.warn('[global-teardown] Cleanup warning:', error.message)
  else console.log('[global-teardown] E2E test data cleaned up.')
}

export default teardown
