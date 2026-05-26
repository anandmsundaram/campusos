#!/usr/bin/env node
/**
 * Applies supabase/migrations/031_admin_rbac.sql to the live DB.
 * Reads SUPABASE_DB_URL from .env.local (never committed).
 *
 * Usage: node scripts/apply-migration-031.js
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
  path.join(__dirname, '../supabase/migrations/031_admin_rbac.sql'),
  'utf8'
)

async function run() {
  const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log(`Connected to ${host}:${port}/${database}`)
    await client.query(sql)
    console.log('Migration 031 applied successfully.')

    // Quick verification
    const { rows: roles } = await client.query(
      `SELECT admin_role, count(*) FROM public.profiles GROUP BY admin_role ORDER BY admin_role`
    )
    console.log('admin_role distribution:', roles.map(r => `${r.admin_role}: ${r.count}`).join(', '))

    const { rows: fns } = await client.query(
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public'
         AND routine_name IN ('current_user_role','is_global_admin','is_campus_admin','can_admin_campus')
       ORDER BY routine_name`
    )
    console.log('Helper functions:', fns.map(r => r.routine_name).join(', '))
  } finally {
    await client.end()
  }
}

run().catch(err => { console.error('Migration failed:', err.message); process.exit(1) })
