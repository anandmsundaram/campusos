/**
 * Spec 32 — Admin RBAC and Ops Dashboard
 *
 * Verifies role-based access control for /dashboard/admin using DB-driven
 * admin_role (not hardcoded email lists), and that each admin scope sees
 * the correct sections.
 *
 *  1.  Non-admin user is redirected away from /dashboard/admin.
 *  2.  Admin nav link is hidden in sidebar for non-admin user.
 *  3.  Global admin can reach /dashboard/admin (no redirect).
 *  4.  Global admin sees "Global Admin" role badge.
 *  5.  Global admin sees system health metrics grid.
 *  6.  Global admin sees campus filter controls.
 *  7.  Global admin sees onboarding funnel section.
 *  8.  Global admin sees recent requests section.
 *  9.  Global admin sees recent users section.
 * 10.  Global admin sees audit log section.
 * 11.  Global admin sees pending reports section.
 * 12.  Global admin campus filter narrows URL to ?campus=<id>.
 * 13.  Campus admin can reach /dashboard/admin (no redirect).
 * 14.  Campus admin sees "Campus Admin" role badge.
 * 15.  Campus admin does NOT see campus filter controls.
 * 16.  Campus admin does NOT see onboarding funnel (analytics RLS blocks it).
 * 17.  Admin nav link is visible in sidebar for admin user.
 */

import { test, expect } from '../helpers/fixtures'
import {
  getUserId,
  driverCreds,
  pax1Creds,
  pax2Creds,
  setUserAdminRole,
  seedTourCompleted,
  seedTermsAcceptance,
  getCampusId,
  setUserCampus,
} from '../helpers/db'

test.describe('Admin RBAC and ops dashboard', () => {
  let driverUserId: string
  let pax1UserId: string
  let pax2UserId: string
  let tamuCampusId: string

  test.beforeAll(async () => {
    ;[driverUserId, pax1UserId, pax2UserId, tamuCampusId] = await Promise.all([
      getUserId(driverCreds().email),
      getUserId(pax1Creds().email),
      getUserId(pax2Creds().email),
      getCampusId('tamu'),
    ])
  })

  test.beforeEach(async () => {
    await Promise.all([
      // Driver → global_admin for these tests
      setUserAdminRole(driverUserId, 'global_admin'),
      // pax1 and pax2 start as regular users
      setUserAdminRole(pax1UserId, 'user'),
      setUserAdminRole(pax2UserId, 'user'),
      // All users on TAMU with tour + terms satisfied
      setUserCampus(driverUserId, tamuCampusId),
      setUserCampus(pax1UserId, tamuCampusId),
      setUserCampus(pax2UserId, tamuCampusId),
      seedTourCompleted(driverUserId),
      seedTourCompleted(pax1UserId),
      seedTourCompleted(pax2UserId),
      seedTermsAcceptance(driverUserId),
      seedTermsAcceptance(pax1UserId),
      seedTermsAcceptance(pax2UserId),
    ])
  })

  test.afterEach(async () => {
    // Restore all roles to 'user' so other specs are unaffected
    await Promise.all([
      setUserAdminRole(driverUserId, 'user'),
      setUserAdminRole(pax1UserId, 'user'),
      setUserAdminRole(pax2UserId, 'user'),
    ])
  })

  // ── 1: Non-admin redirect ────────────────────────────────────────────────────
  test('non-admin user is redirected from /dashboard/admin', async ({ pax2Page: page }) => {
    await page.goto('/dashboard/admin')
    await page.waitForURL(/\/dashboard($|\?)/, { timeout: 10_000 })
    expect(page.url()).not.toContain('/dashboard/admin')
  })

  // ── 2: Admin link hidden for non-admin ──────────────────────────────────────
  test('admin nav link is hidden in sidebar for non-admin', async ({ pax2Page: page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // The Admin nav link must not appear
    const adminLinks = page.locator('a[href="/dashboard/admin"]')
    await expect(adminLinks).toHaveCount(0)
  })

  // ── 3: Global admin can reach admin page ────────────────────────────────────
  test('global admin can access /dashboard/admin without redirect', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await page.waitForSelector('[data-testid="admin-page"]', { timeout: 15_000 })
    expect(page.url()).toContain('/dashboard/admin')
  })

  // ── 4: Global Admin role badge ───────────────────────────────────────────────
  test('global admin sees Global Admin role badge', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await page.waitForSelector('[data-testid="role-badge"]', { timeout: 15_000 })
    await expect(page.locator('[data-testid="role-badge"]')).toContainText('Global Admin')
  })

  // ── 5: Health metrics grid ───────────────────────────────────────────────────
  test('global admin sees system health metrics', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    const metrics = page.locator('[data-testid="health-metrics"]')
    await expect(metrics).toBeVisible({ timeout: 15_000 })
    // At least one stat card is visible
    await expect(metrics.locator('div').first()).toBeVisible()
  })

  // ── 6: Campus filter visible ────────────────────────────────────────────────
  test('global admin sees campus filter controls', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('[data-testid="campus-filter"]')).toBeVisible({ timeout: 15_000 })
  })

  // ── 7: Onboarding funnel visible ────────────────────────────────────────────
  test('global admin sees onboarding funnel section', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await page.waitForSelector('[data-testid="admin-page"]', { timeout: 15_000 })
    await expect(page.getByRole('region', { name: 'Onboarding funnel' })).toBeVisible()
  })

  // ── 8: Requests section ─────────────────────────────────────────────────────
  test('global admin sees recent requests section', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('[data-testid="requests-section"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="requests-section"] h2')).toContainText('Recent Requests')
  })

  // ── 9: Users section ────────────────────────────────────────────────────────
  test('global admin sees recent users section', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('[data-testid="users-section"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="users-section"] h2')).toContainText('Recent Users')
  })

  // ── 10: Audit log section ───────────────────────────────────────────────────
  test('global admin sees audit log section', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('[data-testid="audit-section"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="audit-section"] h2')).toContainText('Audit Log')
  })

  // ── 11: Reports section ─────────────────────────────────────────────────────
  test('global admin sees pending reports section', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    await expect(page.locator('[data-testid="reports-section"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="reports-section"] h2')).toContainText('Pending Reports')
  })

  // ── 12: Campus filter narrows URL ───────────────────────────────────────────
  test('global admin campus filter appends ?campus= to URL', async ({ driverPage: page }) => {
    await page.goto('/dashboard/admin')
    const campusFilter = page.locator('[data-testid="campus-filter"]')
    await campusFilter.waitFor({ timeout: 15_000 })
    // Click the first named campus link (not "All")
    const campusLinks = campusFilter.locator('a').filter({ hasNotText: 'All' })
    const count = await campusLinks.count()
    if (count > 0) {
      await campusLinks.first().click()
      await page.waitForURL(/campus=/, { timeout: 10_000 })
      expect(page.url()).toContain('campus=')
    }
  })

  // ── 13: Campus admin can reach admin page ───────────────────────────────────
  test('campus admin can access /dashboard/admin without redirect', async ({ pax1Page: page }) => {
    await setUserAdminRole(pax1UserId, 'campus_admin')
    await page.goto('/dashboard/admin')
    await page.waitForSelector('[data-testid="admin-page"]', { timeout: 15_000 })
    expect(page.url()).toContain('/dashboard/admin')
  })

  // ── 14: Campus Admin role badge ─────────────────────────────────────────────
  test('campus admin sees Campus Admin role badge', async ({ pax1Page: page }) => {
    await setUserAdminRole(pax1UserId, 'campus_admin')
    await page.goto('/dashboard/admin')
    await page.waitForSelector('[data-testid="role-badge"]', { timeout: 15_000 })
    await expect(page.locator('[data-testid="role-badge"]')).toContainText('Campus Admin')
  })

  // ── 15: Campus admin has no campus filter ───────────────────────────────────
  test('campus admin does not see campus filter', async ({ pax1Page: page }) => {
    await setUserAdminRole(pax1UserId, 'campus_admin')
    await page.goto('/dashboard/admin')
    await page.waitForSelector('[data-testid="admin-page"]', { timeout: 15_000 })
    await expect(page.locator('[data-testid="campus-filter"]')).toHaveCount(0)
  })

  // ── 16: Campus admin has no funnel section ──────────────────────────────────
  test('campus admin does not see onboarding funnel section', async ({ pax1Page: page }) => {
    await setUserAdminRole(pax1UserId, 'campus_admin')
    await page.goto('/dashboard/admin')
    await page.waitForSelector('[data-testid="admin-page"]', { timeout: 15_000 })
    // Funnel is only rendered for global_admin
    await expect(page.getByRole('region', { name: 'Onboarding funnel' })).toHaveCount(0)
  })

  // ── 17: Admin link visible in sidebar for admin ──────────────────────────────
  test('admin nav link is visible in sidebar when user is an admin', async ({ driverPage: page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const adminLink = page.locator('a[href="/dashboard/admin"]')
    await expect(adminLink).toBeVisible({ timeout: 10_000 })
  })
})
