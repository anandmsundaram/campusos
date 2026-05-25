'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getGateStatus } from '@/lib/terms'
import { getTourState, storeTourCompleted, storeTourSkipped, isTourDone } from '@/lib/tour'
import TermsModal from './TermsModal'
import FirstLoginTour from './FirstLoginTour'

type Phase = 'loading' | 'terms' | 'tour' | 'done'

export default function FirstLoginGate() {
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    checkGate().catch(() => setPhase('done'))
  }, [])

  async function checkGate() {
    const supabase = createClient()
    const gate = await getGateStatus(supabase)

    if (gate.mustAcceptTerms) {
      // Show proactive modal only for brand-new users who have never accepted
      // any version of the terms. Returning users with outdated acceptance are
      // re-gated at the action level (post/offer) to avoid duplicate modals.
      if (gate.isFirstLogin) {
        setPhase('terms')
      } else {
        setPhase('done')
      }
      return
    }

    if (gate.bypassGuidedTour || gate.bypassOnboarding) {
      setPhase('done')
      return
    }

    const tourState = await getTourState(supabase)
    if (isTourDone(tourState)) {
      setPhase('done')
      return
    }

    setPhase('tour')
  }

  async function handleTermsAccepted() {
    const supabase = createClient()
    // Terms were just accepted; check only bypass and tour state
    const gate = await getGateStatus(supabase)

    if (gate.bypassGuidedTour || gate.bypassOnboarding) {
      setPhase('done')
      return
    }

    const tourState = await getTourState(supabase)
    if (isTourDone(tourState)) {
      setPhase('done')
      return
    }

    setPhase('tour')
  }

  async function handleTourCompleted() {
    const supabase = createClient()
    await storeTourCompleted(supabase)
    setPhase('done')
  }

  async function handleTourSkipped(step: number) {
    const supabase = createClient()
    await storeTourSkipped(supabase, step)
    setPhase('done')
  }

  if (phase === 'loading') return null

  if (phase === 'terms') {
    return (
      <TermsModal
        onAccepted={handleTermsAccepted}
        onDismiss={() => setPhase('done')}
        source="first-login-gate"
      />
    )
  }

  if (phase === 'tour') {
    return (
      <FirstLoginTour
        onCompleted={handleTourCompleted}
        onSkipped={handleTourSkipped}
      />
    )
  }

  return null
}
