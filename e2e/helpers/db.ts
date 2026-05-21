/**
 * Supabase admin helpers for E2E test setup and teardown.
 *
 * Uses the service-role key so all operations bypass RLS.
 * Tests import these to seed state and clean up after themselves.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Admin client (service-role, bypasses RLS) ────────────────────────────────

let _admin: SupabaseClient | null = null

export function adminClient(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.E2E_SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_KEY. ' +
      'Copy .env.test.local.example → .env.test.local and fill in values.'
    )
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _admin
}

// ─── User identity helpers ────────────────────────────────────────────────────

export interface TestUser {
  id: string
  email: string
  password: string
  name: string
}

export function driverCreds(): { email: string; password: string; name: string } {
  return {
    email: process.env.E2E_DRIVER_EMAIL!,
    password: process.env.E2E_DRIVER_PASSWORD!,
    name: process.env.E2E_DRIVER_NAME ?? 'E2E Driver',
  }
}

export function pax1Creds(): { email: string; password: string; name: string } {
  return {
    email: process.env.E2E_PAX1_EMAIL!,
    password: process.env.E2E_PAX1_PASSWORD!,
    name: process.env.E2E_PAX1_NAME ?? 'E2E Passenger1',
  }
}

export function pax2Creds(): { email: string; password: string; name: string } {
  return {
    email: process.env.E2E_PAX2_EMAIL!,
    password: process.env.E2E_PAX2_PASSWORD!,
    name: process.env.E2E_PAX2_NAME ?? 'E2E Passenger2',
  }
}

/** Look up a user's auth UUID by email. */
export async function getUserId(email: string): Promise<string> {
  const result = await adminClient().auth.admin.listUsers()
  if (result.error) throw result.error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users: { id: string; email?: string }[] = (result.data as any).users ?? []
  const user = users.find(u => u.email === email)
  if (!user) throw new Error(`Test user not found: ${email}`)
  return user.id
}

// ─── Request seed helpers ─────────────────────────────────────────────────────

export interface SeedRideOptions {
  requesterId: string
  runId: string
  originCity?: string
  destinationCity?: string
  availableSeats?: number
  budget?: number
  /** Seconds from now (negative = in the past). Defaults to +2h. */
  scheduledOffsetSeconds?: number
}

/**
 * Insert a driver ride request directly, bypassing the AI parser.
 * Returns the new request id.
 */
export async function seedDriverRide(opts: SeedRideOptions): Promise<string> {
  const {
    requesterId,
    runId,
    originCity = 'Austin',
    destinationCity = 'Dallas',
    availableSeats = 3,
    budget = 20,
    scheduledOffsetSeconds = 7200,
  } = opts

  const scheduledTime = new Date(Date.now() + scheduledOffsetSeconds * 1000).toISOString()

  const { data, error } = await adminClient()
    .from('requests')
    .insert({
      requester_id: requesterId,
      category: 'rides',
      title: `[E2E-${runId}] ${originCity} → ${destinationCity}`,
      urgency: 'medium',
      status: 'open',
      origin_city: originCity,
      destination_city: destinationCity,
      is_driver: true,
      available_seats: availableSeats,
      seats_filled: 0,
      budget,
      scheduled_time: scheduledTime,
      auto_accept: false,
      price_type: 'fixed',
      is_round_trip: false,
      flexible_time: false,
      is_airport_ride: false,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export interface SeedOfferOptions {
  requestId: string
  helperId: string
  counterBudget?: number | null
  seatsRequested?: number
  message?: string
}

/**
 * Insert a pending offer, bypassing RPC validation.
 * Returns the new offer id.
 */
export async function seedOffer(opts: SeedOfferOptions): Promise<string> {
  const { requestId, helperId, counterBudget = null, seatsRequested = 1, message = null } = opts

  const { data, error } = await adminClient()
    .from('request_offers')
    .insert({
      request_id: requestId,
      helper_id: helperId,
      counter_budget: counterBudget,
      seats_requested: seatsRequested,
      message,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

/**
 * Accept an offer and update the request status, mirroring accept_offer_atomic.
 * Used for test setup only — tests that test the acceptance flow use the UI.
 */
export async function seedAcceptOffer(
  offerId: string,
  requestId: string,
  seatsRequested = 1,
): Promise<void> {
  const db = adminClient()

  // Fetch request to compute new seats_filled and status
  const { data: req, error: reqErr } = await db
    .from('requests')
    .select('available_seats, seats_filled, budget, is_driver')
    .eq('id', requestId)
    .single()
  if (reqErr) throw reqErr

  // Fetch offer for price
  const { data: offer, error: offerErr } = await db
    .from('request_offers')
    .select('counter_budget, requester_counter')
    .eq('id', offerId)
    .single()
  if (offerErr) throw offerErr

  const finalAgreedPrice = offer.requester_counter ?? offer.counter_budget ?? req.budget

  const isMultiSeat = req.is_driver && req.available_seats != null
  let newStatus = 'matched'
  let newFilled: number | null = null

  if (isMultiSeat) {
    const filled: number = (req.seats_filled ?? 0) + seatsRequested
    newFilled = filled
    newStatus = filled >= req.available_seats! ? 'matched' : 'open'
    await db.from('requests').update({ status: newStatus, seats_filled: filled }).eq('id', requestId)
  } else {
    await db.from('requests').update({ status: 'matched' }).eq('id', requestId)
  }

  await db
    .from('request_offers')
    .update({ status: 'accepted', final_agreed_price: finalAgreedPrice })
    .eq('id', offerId)
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Delete all requests (and cascaded offers) whose title starts with [E2E-{runId}].
 * Call in afterEach / global teardown.
 */
export async function cleanupRunData(runId: string): Promise<void> {
  const db = adminClient()

  // Offers cascade-delete when request is deleted (FK ON DELETE CASCADE)
  const { error } = await db
    .from('requests')
    .delete()
    .like('title', `[E2E-${runId}]%`)

  if (error) console.warn('[e2e/db] cleanup warning:', error.message)
}

/**
 * Delete all test data for all E2E runs (useful in global teardown).
 */
export async function cleanupAllE2EData(): Promise<void> {
  const db = adminClient()
  const { error } = await db
    .from('requests')
    .delete()
    .like('title', '[E2E-%')
  if (error) console.warn('[e2e/db] global cleanup warning:', error.message)
}

// ─── Authenticated client for RPC tests ──────────────────────────────────────
// complete_request_safe and cancel_request_safe use auth.uid() internally.
// The service-role admin client has no JWT, so auth.uid() returns NULL and
// those functions return "Not authenticated". Use authenticatedClient() instead
// when a test needs to exercise the RPCs themselves (not just set up state).

/**
 * Sign in as the given user with the anon key and return the authenticated client.
 * Each call creates a fresh session — no caching.
 */
export async function authenticatedClient(email: string, password: string): Promise<SupabaseClient> {
  const url = process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Missing E2E_SUPABASE_URL or E2E_SUPABASE_ANON_KEY')
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Test sign-in failed for ${email}: ${error.message}`)
  return client
}

// ─── Direct DB state helpers ──────────────────────────────────────────────────
// Bypass RPC auth for tests that only need state set up, not the RPC itself.

/** Directly mark a request as completed without going through the RPC. */
export async function completeRequestDirect(requestId: string): Promise<void> {
  const { error } = await adminClient()
    .from('requests')
    .update({ status: 'completed' })
    .eq('id', requestId)
  if (error) throw error
}

/** Directly mark a request as cancelled without going through the RPC. */
export async function cancelRequestDirect(
  requestId: string,
  reason = 'cancelled_by_requester',
): Promise<void> {
  const { error } = await adminClient()
    .from('requests')
    .update({ status: 'cancelled', cancellation_reason: reason })
    .eq('id', requestId)
  if (error) throw error
}
