#!/usr/bin/env node
/**
 * Diagnostic: inspect offer amounts for recently matched requests.
 * Development-only — never committed with sensitive output, never deployed.
 *
 * Usage: node scripts/diag-offer-amounts.js [partial-title]
 *   partial-title — optional case-insensitive substring to filter request title
 *
 * Reports per matched request:
 *   - request id, title, status, final_agreed_price, accepted_helper_id
 *   - all offers: id, helper_id, status, counter_budget, requester_counter,
 *     final_agreed_price, created_at
 *   - flags any inconsistency: wrong display amount, stale pending/countered offers
 */
const dns = require('dns')
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first')

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadEnv(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* file may not exist */ }
}

loadEnv(path.join(__dirname, '../.env.local'))
loadEnv(path.join(__dirname, '../.env.test.local'))

const rawUrl = process.env.SUPABASE_DB_URL
if (!rawUrl) {
  console.error('SUPABASE_DB_URL not found in .env.local or .env.test.local')
  process.exit(1)
}

const decoded = rawUrl.replace(/%40/g, '@').replace(/%23/g, '#').replace(/%3A/gi, ':')
const withoutProto = decoded.replace(/^postgresql:\/\/|^postgres:\/\//, '')
const firstColon = withoutProto.indexOf(':')
const lastAt = withoutProto.lastIndexOf('@')
const user = withoutProto.slice(0, firstColon)
const password = withoutProto.slice(firstColon + 1, lastAt)
const rest = withoutProto.slice(lastAt + 1)
const [hostPort, database] = rest.split('/')
const [host, portStr] = hostPort.split(':')
const port = parseInt(portStr ?? '5432', 10)

const titleFilter = process.argv[2] ?? ''

async function run() {
  const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log(`Connected to ${host}:${port}/${database}\n`)

    // Find recently matched requests (last 30 days)
    // Note: requests has no final_agreed_price or accepted_helper_id columns;
    // those live on request_offers only.
    const { rows: requests } = await client.query(`
      SELECT
        r.id,
        r.title,
        r.status,
        r.budget,
        r.created_at,
        p.name                AS requester_name
      FROM public.requests r
      LEFT JOIN public.profiles p ON p.id = r.requester_id
      WHERE r.status IN ('matched', 'completed')
        AND r.created_at > NOW() - INTERVAL '30 days'
        AND ($1 = '' OR lower(r.title) LIKE '%' || lower($1) || '%')
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [titleFilter])

    if (requests.length === 0) {
      console.log('No matched/completed requests found in last 30 days matching filter.')
      return
    }

    for (const req of requests) {
      console.log('═══════════════════════════════════════════════════════════════')
      console.log(`REQUEST: "${req.title}"`)
      console.log(`  id:                  ${req.id}`)
      console.log(`  status:              ${req.status}`)
      console.log(`  budget:              $${req.budget ?? 'null'}`)
      console.log(`  requester:           ${req.requester_name ?? 'unknown'}`)
      console.log(`  created_at:          ${req.created_at}`)

      const { rows: offers } = await client.query(`
        SELECT
          o.id,
          o.status,
          o.counter_budget,
          o.requester_counter,
          o.final_agreed_price  AS offer_final_agreed_price,
          o.seats_requested,
          o.created_at,

          hp.name               AS helper_name,
          hp.id                 AS helper_id
        FROM public.request_offers o
        LEFT JOIN public.profiles hp ON hp.id = o.helper_id
        WHERE o.request_id = $1
        ORDER BY o.created_at ASC
      `, [req.id])

      console.log(`\n  OFFERS (${offers.length}):`)
      for (const o of offers) {
        const flags = []
        if (o.status === 'accepted') flags.push('★ ACCEPTED')
        if (o.status === 'pending' || o.status === 'countered') flags.push('⚠ STALE — should be rejected')
        console.log(`    ───`)
        console.log(`    offer id:         ${o.id}`)
        console.log(`    helper:           ${o.helper_name ?? 'unknown'} (${o.helper_id})`)
        console.log(`    status:           ${o.status}  ${flags.join(' ')}`)
        console.log(`    counter_budget:   $${o.counter_budget ?? 'null'}   (helper's original offer)`)
        console.log(`    requester_counter:$${o.requester_counter ?? 'null'} (requester's counter back)`)
        console.log(`    final_agreed_price: $${o.offer_final_agreed_price ?? 'null'}`)
        console.log(`    created_at:       ${o.created_at}`)

      }

      // Derive what the card SHOULD show vs what old code would show
      const acceptedOffer = offers.find(o => o.status === 'accepted')
      const shouldShow = acceptedOffer
        ? (acceptedOffer.offer_final_agreed_price ?? acceptedOffer.requester_counter ?? acceptedOffer.counter_budget)
        : req.budget

      // Old bug: any offer with a requester_counter (even non-accepted) could drive display
      const staleCounterOffer = offers.find(o => o.status !== 'accepted' && o.requester_counter != null)
      const stalePendingOffers = offers.filter(o => o.status === 'pending' || o.status === 'countered')

      console.log(`\n  DIAGNOSIS:`)
      console.log(`    Correct display amount: $${shouldShow ?? 'unknown'}`)
      if (stalePendingOffers.length > 0) {
        console.log(`    ⚠ INCONSISTENCY: ${stalePendingOffers.length} stale pending/countered offer(s) still present`)
        for (const o of stalePendingOffers) {
          console.log(`      - offer ${o.id} (${o.helper_name}) status=${o.status}`)
        }
      } else {
        console.log(`    ✓ No stale pending/countered offers`)
      }
      if (staleCounterOffer) {
        console.log(`    ⚠ Stale requester_counter $${staleCounterOffer.requester_counter} from non-accepted offer (${staleCounterOffer.helper_name}) could drive old card display`)
      }
      console.log()
    }
  } finally {
    await client.end()
  }
}

run().catch(err => { console.error('Diagnostic failed:', err.message); process.exit(1) })
