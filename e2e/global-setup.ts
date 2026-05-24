/**
 * Global setup — runs once before the entire test suite.
 *
 * 1. Creates the three E2E test users in Supabase Auth (idempotent).
 * 2. Ensures a matching profile row exists for each user.
 * 3. Logs each user in via the app and saves the browser storage state,
 *    so individual tests can skip the login step.
 */

import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: path.resolve(__dirname, '../.env.test.local') })

const AUTH_DIR = path.resolve(__dirname, '../playwright/.auth')

async function setup(_config: FullConfig) {
  const supabaseUrl = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_KEY
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      '\n\n[global-setup] Missing env vars.\n' +
      'Copy .env.test.local.example → .env.test.local and fill in:\n' +
      '  E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_KEY, E2E_DRIVER_EMAIL/PASSWORD, etc.\n'
    )
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const users = [
    {
      email: process.env.E2E_DRIVER_EMAIL!,
      password: process.env.E2E_DRIVER_PASSWORD!,
      name: process.env.E2E_DRIVER_NAME ?? 'E2E Driver',
      stateFile: path.join(AUTH_DIR, 'driver.json'),
    },
    {
      email: process.env.E2E_PAX1_EMAIL!,
      password: process.env.E2E_PAX1_PASSWORD!,
      name: process.env.E2E_PAX1_NAME ?? 'E2E Passenger1',
      stateFile: path.join(AUTH_DIR, 'pax1.json'),
    },
    {
      email: process.env.E2E_PAX2_EMAIL!,
      password: process.env.E2E_PAX2_PASSWORD!,
      name: process.env.E2E_PAX2_NAME ?? 'E2E Passenger2',
      stateFile: path.join(AUTH_DIR, 'pax2.json'),
    },
  ]

  // Ensure auth dir exists
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  // ── Create/verify auth users ──────────────────────────────────────────────
  const listResult = await admin.auth.admin.listUsers()
  if (listResult.error) throw listResult.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingUsers: { id: string; email?: string }[] = (listResult.data as any).users ?? []
  const existingEmails = new Set(existingUsers.map(u => u.email))

  for (const u of users) {
    if (!existingEmails.has(u.email)) {
      const { error } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { name: u.name },
      })
      if (error) throw new Error(`Failed to create test user ${u.email}: ${error.message}`)
      console.log(`[global-setup] Created test user: ${u.email}`)
    } else {
      // Make sure password is up-to-date (useful after re-runs with new creds)
      const uid = existingUsers.find(eu => eu.email === u.email)!.id
      await admin.auth.admin.updateUserById(uid, { password: u.password })
      console.log(`[global-setup] Verified test user: ${u.email}`)
    }
  }

  // ── Ensure profile rows exist ─────────────────────────────────────────────
  const updatedResult = await admin.auth.admin.listUsers()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedUsers: { id: string; email?: string }[] = (updatedResult.data as any)?.users ?? []
  for (const u of users) {
    const authUser = updatedUsers.find(au => au.email === u.email)
    if (!authUser) continue

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle()

    if (!existing) {
      const { error } = await admin.from('profiles').insert({
        id: authUser.id,
        name: u.name,
        university: 'E2E University',
      })
      if (error) console.warn(`[global-setup] Profile insert warning for ${u.email}:`, error.message)
    }
  }

  // ── Seed terms acceptance for all test users (avoids breaking existing specs) ──
  const TERMS_VERSION      = '2026-05-terms-v1'
  const PRIVACY_VERSION    = '2026-05-privacy-v1'
  const GUIDELINES_VERSION = '2026-05-guidelines-v1'
  for (const authUser of updatedUsers.filter(au => users.some(u => u.email === au.email))) {
    await admin.auth.admin.updateUserById(authUser.id, {
      user_metadata: {
        terms_accepted: {
          terms_version:      TERMS_VERSION,
          privacy_version:    PRIVACY_VERSION,
          guidelines_version: GUIDELINES_VERSION,
          accepted_at:        new Date().toISOString(),
          accepted_from:      'global_setup',
        },
      },
    })
  }

  // ── Log each user in via the browser and save storage state ──────────────
  const browser = await chromium.launch()

  for (const u of users) {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(`${baseUrl}/login`)
    await page.locator('#email').fill(u.email)
    await page.locator('#password').fill(u.password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 20_000 })

    await context.storageState({ path: u.stateFile })
    console.log(`[global-setup] Saved auth state for: ${u.email}`)
    await context.close()
  }

  await browser.close()
  console.log('[global-setup] Done.')
}

export default setup
