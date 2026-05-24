/**
 * Terms gate helpers.
 *
 * Storage strategy (v1 beta):
 *   Acceptance and QA-bypass flags are stored in auth.users.raw_user_meta_data
 *   (via supabase.auth.updateUser / auth.admin.updateUserById) so they work
 *   without the long-term DB tables (migrations 026/027).
 *   Once those migrations are applied the implementation can be upgraded to
 *   use the dedicated tables; the public API of this module stays the same.
 */

export const TERMS_VERSION      = '2026-05-terms-v1'
export const PRIVACY_VERSION    = '2026-05-privacy-v1'
export const GUIDELINES_VERSION = '2026-05-guidelines-v1'

export interface GateStatus {
  hasAcceptedTerms:     boolean
  bypassTermsAcceptance: boolean
  bypassGuidedTour:     boolean
  bypassOnboarding:     boolean
  mustAcceptTerms:      boolean
}

type MinimalSupabaseClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { user_metadata?: Record<string, unknown> } | null } }>
  }
}

/** Read the current user's gate status from their auth metadata. */
export async function getGateStatus(supabase: MinimalSupabaseClient): Promise<GateStatus> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { hasAcceptedTerms: false, bypassTermsAcceptance: false, bypassGuidedTour: false, bypassOnboarding: false, mustAcceptTerms: true }
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>

  // Terms acceptance
  const ta = meta.terms_accepted as Record<string, unknown> | null | undefined
  const hasAcceptedTerms =
    ta?.terms_version      === TERMS_VERSION &&
    ta?.privacy_version    === PRIVACY_VERSION &&
    ta?.guidelines_version === GUIDELINES_VERSION

  // QA bypass flags
  const bp = meta.qa_bypass as Record<string, unknown> | null | undefined
  const bypassActive = bp?.is_active !== false
  const bypassNotExpired = !bp?.expires_at || new Date(bp.expires_at as string) > new Date()
  const bypassTermsAcceptance = bypassActive && bypassNotExpired && bp?.bypass_terms_acceptance === true
  const bypassGuidedTour      = bypassActive && bypassNotExpired && bp?.bypass_guided_tour === true
  const bypassOnboarding      = bypassActive && bypassNotExpired && bp?.bypass_onboarding === true

  return {
    hasAcceptedTerms,
    bypassTermsAcceptance,
    bypassGuidedTour,
    bypassOnboarding,
    mustAcceptTerms: !hasAcceptedTerms && !bypassTermsAcceptance,
  }
}

type UpdateSupabaseClient = {
  auth: {
    updateUser: (opts: { data: Record<string, unknown> }) => Promise<{ error: { message: string } | null }>
  }
}

/** Persist the user's acceptance of the current terms versions. */
export async function storeTermsAcceptance(
  supabase: UpdateSupabaseClient,
  source?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({
    data: {
      terms_accepted: {
        terms_version:      TERMS_VERSION,
        privacy_version:    PRIVACY_VERSION,
        guidelines_version: GUIDELINES_VERSION,
        accepted_at:        new Date().toISOString(),
        accepted_from:      source ?? 'dashboard',
      },
    },
  })
  return { error: error?.message ?? null }
}
