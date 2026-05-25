'use client'

import FirstLoginGate from '@/app/components/FirstLoginGate'

/**
 * Upgraded: delegates to FirstLoginGate which handles the full
 * terms-acceptance → guided tour first-login flow.
 */
export default function OnboardingCard() {
  return <FirstLoginGate />
}
