'use client'

import { useEffect, useRef } from 'react'
import { trackEvent, type EventName, type EventProperties } from '@/lib/analytics'

interface Props {
  event: EventName
  properties?: EventProperties
  // Default true — fires once per mount regardless of re-renders
  once?: boolean
}

export default function PageTracker({ event, properties, once = true }: Props) {
  const fired = useRef(false)

  useEffect(() => {
    if (once && fired.current) return
    fired.current = true
    trackEvent(event, properties)
  // properties intentionally excluded to avoid re-fires on parent re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, once])

  return null
}
