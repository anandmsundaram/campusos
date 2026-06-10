#!/usr/bin/env node
/**
 * Applies supabase/migrations/041_reconcile_stale_offers_and_guard.sql
 * to the live DB. Reads SUPABASE_DB_URL from .env.local.
 *
 * Usage: node scripts/apply-migration-041.js
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

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/041_reconcile_stale_offers_and_guard.sql'),
  'utf8'
)

async function run() {
  const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log(`Connected to ${host}:${port}/${database}`)
    await client.query(sql)
    console.log('Migration 041 applied successfully.')

    // Verify: no stale pending/countered offers on matched/completed requests
    const { rows: staleOffers } = await client.query(`
      SELECT o.id, o.status, r.status AS req_status
      FROM public.request_offers o
      JOIN public.requests r ON r.id = o.request_id
      WHERE o.status IN ('pending','countered')
        AND r.status IN ('matched','completed')
      LIMIT 10
    `)
    if (staleOffers.length === 0) {
      console.log('✓ No stale pending/countered offers remain on matched/completed requests.')
    } else {
      console.warn('⚠ Stale offers still found:', staleOffers)
    }

    // Verify the function has step 5.1
    const { rows } = await client.query(
      `SELECT prosrc FROM pg_proc WHERE proname = 'accept_offer_atomic'`
    )
    if (rows.length > 0) {
      const has51 = rows[0].prosrc.includes('Single-seat guard')
      console.log('Function accept_offer_atomic present:', rows.length > 0)
      console.log('Step 5.1 (single-seat double-acceptance guard) present:', has51)
    }
  } finally {
    await client.end()
  }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1) })
