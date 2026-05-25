#!/usr/bin/env node
/**
 * Applies supabase/migrations/030_campus_scoping.sql to the live DB.
 * Reads SUPABASE_DB_URL from .env.local (never committed).
 *
 * Usage: node scripts/apply-migration-030.js
 */

// Prefer IPv4 to avoid ECONNREFUSED on IPv6-blocked Supabase ports
const dns = require('dns')
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first')

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

// Parse .env.local manually
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

// Parse URL manually to handle passwords containing '@' or percent-encoded chars
// Format: postgresql://user:password@host:port/database
const decoded = rawUrl.replace(/%40/g, '@').replace(/%23/g, '#').replace(/%3A/gi, ':')
const withoutProto = decoded.replace(/^postgresql:\/\/|^postgres:\/\//, '')
const firstColon = withoutProto.indexOf(':')
const lastAt = withoutProto.lastIndexOf('@')
const user = withoutProto.slice(0, firstColon)
const password = withoutProto.slice(firstColon + 1, lastAt)
const rest = withoutProto.slice(lastAt + 1) // host:port/database
const [hostPort, database] = rest.split('/')
const [host, portStr] = hostPort.split(':')
const port = parseInt(portStr ?? '5432', 10)

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/030_campus_scoping.sql'),
  'utf8'
)

async function run() {
  const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log(`Connected to ${host}:${port}/${database}`)
    await client.query(sql)
    console.log('Migration 030 applied successfully.')

    // Quick verification
    const { rows: campuses } = await client.query('SELECT slug, name FROM public.campuses ORDER BY slug')
    console.log('Campuses:', campuses.map(r => `${r.slug} (${r.name})`).join(', '))

    const { rows: [pCnt] } = await client.query('SELECT count(*) FROM public.profiles WHERE campus_id IS NULL')
    console.log('Profiles with null campus_id:', pCnt.count)

    const { rows: [rCnt] } = await client.query('SELECT count(*) FROM public.requests WHERE campus_id IS NULL')
    console.log('Requests with null campus_id:', rCnt.count)
  } finally {
    await client.end()
  }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1) })
