/**
 * One-off: grant qa_bypass (bypass_terms_acceptance) to a user by email.
 * Usage: npx tsx scripts/bypass-user.ts user@example.com
 */

import path from 'path'
import dotenv from 'dotenv'
import { getUserId, seedBypassUser } from '../e2e/helpers/db'

dotenv.config({ path: path.resolve(__dirname, '../.env.test.local') })

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npx tsx scripts/bypass-user.ts user@example.com')
    process.exit(1)
  }

  console.log(`Looking up user: ${email}`)
  const userId = await getUserId(email)
  console.log(`Found userId: ${userId}`)

  await seedBypassUser(userId, {
    bypassTermsAcceptance: true,
    isActive: true,
    expiresAt: '2027-01-01T00:00:00.000Z',
    reason: 'beta_tester',
  })

  console.log(`Done — bypass set for ${email}`)
}

main().catch(err => { console.error(err); process.exit(1) })
