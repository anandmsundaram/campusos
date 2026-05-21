// Fire-and-forget behavioural event logger for CampusOS.
// Never throws; never awaits in the hot path.
// Extend: set window.__COS_ANALYTICS_HANDLER to pipe events to PostHog/Mixpanel/Amplitude.

import { createClient } from '@/lib/supabase/client'

export type EventName =
  | 'landing_page_view'
  | 'signup_started'
  | 'signup_completed'
  | 'onboarding_card_dismissed'
  | 'first_request_created'
  | 'first_offer_sent'
  | 'request_created'
  | 'offer_submitted'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'ride_completed'
  | 'request_cancelled'
  | 'dashboard_opened'
  | 'notifications_opened'
  | 'messages_opened'
  | 'rides_page_opened'
  | 'profile_viewed'
  | 'repeat_interaction_detected'
  | 'recurring_helper_detected'

export interface EventProperties {
  category?: string
  page?: string
  count?: number
  [key: string]: string | number | boolean | null | undefined
}

declare global {
  interface Window {
    __COS_ANALYTICS_HANDLER?: (event: EventName, props: EventProperties) => void
  }
}

function getSessionId(): string {
  try {
    const key = '_cos_sid'
    let sid = sessionStorage.getItem(key)
    if (!sid) {
      sid = crypto.randomUUID()
      sessionStorage.setItem(key, sid)
    }
    return sid
  } catch {
    return 'unknown'
  }
}

export function trackEvent(event: EventName, properties: EventProperties = {}): void {
  if (typeof window === 'undefined') return

  try {
    window.__COS_ANALYTICS_HANDLER?.(event, properties)

    const supabase = createClient()
    const sessionId = getSessionId()

    // Intentionally not awaited — fire-and-forget
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from('analytics_events').insert({
        event,
        user_id: user?.id ?? null,
        session_id: sessionId,
        properties,
      })
    })
  } catch {
    // Never propagate analytics errors
  }
}
