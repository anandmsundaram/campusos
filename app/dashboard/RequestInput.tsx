'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LocationPicker } from '@/app/components/LocationPicker'
import type { ResolvedLocation } from '@/lib/location-types'

interface ParsedRequest {
  category: 'rides' | 'moving' | 'peer_help' | 'errands' | 'borrow'
  title: string
  location: string | null
  scheduled_time: string | null
  urgency: 'low' | 'medium' | 'high'
  budget: number | null
  helper_requirements: string | null
  missing_fields: string[]
  origin_city: string | null
  destination_city: string | null
  is_driver: boolean | null
  available_seats: number | null
  is_round_trip: boolean
  return_date: string | null
  flexible_time: boolean
  price_type: 'fixed' | 'split' | 'free' | null
  is_airport_ride: boolean | null
  is_offer: boolean
  ambiguous: boolean
  clarification_question: string | null
  clarification_options: Array<{ label: string; appended_text: string }> | null
  summary: string
  payment_mode_unclear: boolean
  structured_data: Record<string, unknown> | null
}

const CATEGORY_LABELS: Record<ParsedRequest['category'], string> = {
  rides: 'Rides',
  moving: 'Moving Help',
  peer_help: 'Peer Help',
  errands: 'Errands',
  borrow: 'Borrow',
}

const URGENCY_COLORS: Record<ParsedRequest['urgency'], string> = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
}

const CATEGORIES: { label: string; icon: string; value: ParsedRequest['category'] }[] = [
  { label: 'Rides', icon: '🚗', value: 'rides' },
  { label: 'Moving Help', icon: '📦', value: 'moving' },
  { label: 'Peer Help', icon: '🤝', value: 'peer_help' },
  { label: 'Errands', icon: '🛍️', value: 'errands' },
  { label: 'Borrow', icon: '📚', value: 'borrow' },
]

const STARTERS: Record<ParsedRequest['category'], string> = {
  rides: 'I need a ride ',
  moving: 'I need moving help ',
  peer_help: 'I need peer help with ',
  errands: 'I need help running an errand ',
  borrow: 'I need to borrow ',
}

const PLACEHOLDERS = [
  'Need a ride to DFW Friday 9am...',
  'Need calc tutoring tonight...',
  'Help moving a couch Saturday...',
  'Walmart run this afternoon...',
]

// ─── Follow-up question config ────────────────────────────────────────────────

type ChipOption = { value: string; label: string }
type FollowUpQuestion =
  | { key: string; label: string; hint?: string; type: 'chips'; options: ChipOption[] }
  | { key: string; label: string; hint?: string; type: 'text'; placeholder: string }

// Rides handled via inline inputs in the confirm card.
const FOLLOWUP_QUESTIONS: Partial<Record<ParsedRequest['category'], FollowUpQuestion[]>> = {
  moving: [
    {
      key: 'helpers_needed',
      label: 'How many helpers do you need?',
      type: 'chips',
      options: [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '4', label: '4+' },
      ],
    },
    {
      key: 'access_type',
      label: 'Stairs or elevator?',
      hint: 'Helps helpers come prepared',
      type: 'chips',
      options: [
        { value: 'stairs', label: '🪜 Stairs' },
        { value: 'elevator', label: '🛗 Elevator' },
        { value: 'ground', label: '🏠 Ground floor' },
      ],
    },
  ],
  errands: [
    {
      key: 'errand_type',
      label: 'What type of errand?',
      type: 'chips',
      options: [
        { value: 'grocery', label: '🛒 Groceries' },
        { value: 'food_pickup', label: '🍕 Food pickup' },
        { value: 'package', label: '📦 Package' },
        { value: 'other', label: '⚡ Other' },
      ],
    },
    {
      key: 'task_details',
      label: 'What should they pick up or do?',
      type: 'text',
      placeholder: 'e.g. Milk and eggs; Pick up package from room 204…',
    },
    {
      key: 'reimbursement_type',
      label: 'Payment arrangement?',
      hint: 'So helpers know what to expect',
      type: 'chips',
      options: [
        { value: 'paid', label: "💰 I'll pay you" },
        { value: 'reimburse', label: '🔄 Reimburse costs' },
        { value: 'free', label: '🤝 Favor' },
      ],
    },
  ],
  peer_help: [
    {
      key: 'subject',
      label: 'Subject or course?',
      type: 'text',
      placeholder: 'e.g. CHEM 101, Calc II, Python…',
    },
    {
      key: 'help_type',
      label: 'What kind of help?',
      type: 'chips',
      options: [
        { value: 'homework', label: '📝 Homework' },
        { value: 'exam_prep', label: '📚 Exam prep' },
        { value: 'concept', label: '💡 Concept explanation' },
        { value: 'coding', label: '💻 Coding help' },
        { value: 'proofreading', label: '✍️ Proofreading' },
        { value: 'study_session', label: '🤝 Study session' },
      ],
    },
    {
      key: 'is_virtual',
      label: 'In person or virtual?',
      type: 'chips',
      options: [
        { value: 'false', label: '📍 In person' },
        { value: 'true', label: '💻 Virtual' },
        { value: 'either', label: '🔀 Either' },
      ],
    },
  ],
  borrow: [
    {
      key: 'item',
      label: 'What do you need to borrow?',
      type: 'text',
      placeholder: 'e.g. drill, graphing calculator, textbook…',
    },
    {
      key: 'borrow_duration',
      label: 'How long do you need it?',
      type: 'chips',
      options: [
        { value: 'a few hours', label: '⏰ Few hours' },
        { value: '1-2 days', label: '📅 1-2 days' },
        { value: 'a week', label: '📆 ~1 week' },
        { value: 'longer', label: '📌 Longer' },
      ],
    },
  ],
}

// Fields that must be filled before the Confirm button unlocks.
// Rides origin/destination are handled separately (inline inputs, top-level parsed fields).
const CRITICAL_FIELDS: Partial<Record<ParsedRequest['category'], string[]>> = {
  peer_help: ['subject'],
  borrow: ['item'],
}

// ─── Label maps for confirm card summary (requester perspective) ──────────────

const ERRAND_TYPE_LABELS: Record<string, string> = {
  grocery: '🛒 Groceries',
  food_pickup: '🍕 Food pickup',
  package: '📦 Package pickup',
  delivery: '🚚 Delivery',
  other: 'Errand',
}
// Requester view — "you" = the requester
const REIMBURSEMENT_LABELS: Record<string, string> = {
  paid: "💰 You'll pay the helper",
  reimburse: '🔄 You reimburse costs',
  free: '🤝 Free favor',
}
const ACCESS_LABELS: Record<string, string> = {
  stairs: '🪜 Stairs',
  elevator: '🛗 Elevator',
  ground: '🏠 Ground floor',
}
const VIRTUAL_LABELS: Record<string, string> = {
  true: '💻 Virtual',
  false: '📍 In person',
  either: '🔀 Either works',
}
const HELP_TYPE_LABELS: Record<string, string> = {
  homework: '📝 Homework help',
  exam_prep: '📚 Exam prep',
  concept: '💡 Concept explanation',
  coding: '💻 Coding help',
  proofreading: '✍️ Proofreading',
  study_session: '🤝 Study session',
}

// ─── Slot-filling workflow engine ────────────────────────────────────────────

type IntentType =
  | 'ride_request'
  | 'ride_offer'
  | 'errand_request'
  | 'errand_offer_unsupported'
  | 'moving_request'
  | 'moving_offer_unsupported'
  | 'peer_help_request'
  | 'peer_help_offer_unsupported'
  | 'borrow_request'
  | 'lend_offer_unsupported'
  | 'social_meal_unsupported'
  | 'general_social_unsupported'

const UNSUPPORTED_MESSAGES: Partial<Record<IntentType, string>> = {
  errand_offer_unsupported: 'Offering to run errands for others is coming soon. Browse the feed to find errand requests you can help with.',
  moving_offer_unsupported: 'Offering moving help is coming soon. Browse the feed to find move requests you can help with.',
  peer_help_offer_unsupported: 'Offering tutoring or peer help is coming soon. Browse the feed to find students who need your help.',
  lend_offer_unsupported: 'Offering to lend items is coming soon. Browse the feed to find borrow requests.',
  social_meal_unsupported: 'Meal hangout posts are coming soon. For now, post a request in Peer Help to find study partners.',
  general_social_unsupported: 'Social posts are coming soon. Use the feed to connect with requests that match your interests.',
}

// Maps a clarification option's appended_text to an intent without calling the parser.
function inferIntentFromOption(
  appended_text: string,
  baseCategory: ParsedRequest['category'],
  baseIsOffer: boolean,
): { intentType: IntentType; category: ParsedRequest['category']; isOffer: boolean } {
  const t = appended_text.toLowerCase()

  // Ride signals
  if (/\b(ride|lift|drive|carpool|seat|passenger|airport|pickup|dropoff)\b/.test(t)) {
    const isOffer = /\b(offer|giving|driving|have seats|driver)\b/.test(t)
    return { intentType: isOffer ? 'ride_offer' : 'ride_request', category: 'rides', isOffer }
  }
  // Moving signals
  if (/\b(mov(e|ing)|haul|furni|couch|boxes?|dorm)\b/.test(t)) {
    const isOffer = /\b(offer|help(ing)?|assist)\b/.test(t) && !/\bneed\b/.test(t)
    return { intentType: isOffer ? 'moving_offer_unsupported' : 'moving_request', category: 'moving', isOffer }
  }
  // Errand signals
  if (/\b(errands?|groceries?|grocery|heb|walmart|target|costco|pickup|delivery|package)\b/.test(t)) {
    const isOffer = /\boffer(ing)?\b/.test(t) || /run errands for/.test(t)
    return { intentType: isOffer ? 'errand_offer_unsupported' : 'errand_request', category: 'errands', isOffer }
  }
  // Peer help signals
  if (/\b(tutor(ing)?|help with|study|homework|exam|class|course|subject|peer)\b/.test(t)) {
    const isOffer = /\boffer(ing)?\b/.test(t) && !/\bneed\b/.test(t)
    return { intentType: isOffer ? 'peer_help_offer_unsupported' : 'peer_help_request', category: 'peer_help', isOffer }
  }
  // Borrow/lend signals
  if (/\b(borrow|lend(ing)?|loan(ing)?)\b/.test(t)) {
    const isOffer = /\b(lend(ing)?|loan(ing)?)\b/.test(t) && !/\bborrow\b/.test(t)
    return { intentType: isOffer ? 'lend_offer_unsupported' : 'borrow_request', category: 'borrow', isOffer }
  }
  // Social/meal
  if (/\b(meal|lunch|dinner|breakfast|eat|hangout|social)\b/.test(t)) {
    return { intentType: 'social_meal_unsupported', category: baseCategory, isOffer: baseIsOffer }
  }

  // Fallback: honour whatever the parser already determined
  if (baseIsOffer && baseCategory !== 'rides') {
    const map: Partial<Record<ParsedRequest['category'], IntentType>> = {
      errands: 'errand_offer_unsupported',
      moving: 'moving_offer_unsupported',
      peer_help: 'peer_help_offer_unsupported',
      borrow: 'lend_offer_unsupported',
    }
    return { intentType: map[baseCategory] ?? 'general_social_unsupported', category: baseCategory, isOffer: true }
  }
  const requestMap: Partial<Record<ParsedRequest['category'], IntentType>> = {
    rides: 'ride_request',
    errands: 'errand_request',
    moving: 'moving_request',
    peer_help: 'peer_help_request',
    borrow: 'borrow_request',
  }
  return { intentType: requestMap[baseCategory] ?? 'general_social_unsupported', category: baseCategory, isOffer: baseIsOffer }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyFollowupAnswers(
  base: Record<string, unknown>,
  answers: Record<string, string>,
): Record<string, unknown> {
  const merged = { ...base }
  for (const [key, rawVal] of Object.entries(answers)) {
    if (rawVal === '') continue
    if (rawVal === 'true') { merged[key] = true; continue }
    if (rawVal === 'false') { merged[key] = false; continue }
    const n = Number(rawVal)
    if (!isNaN(n) && isFinite(n) && rawVal.trim() !== '') { merged[key] = n; continue }
    merged[key] = rawVal
  }
  return merged
}

export default function RequestInput() {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'disambiguating' | 'confirm' | 'saving' | 'done'>('idle')
  const [parsed, setParsed] = useState<ParsedRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoAccept, setAutoAccept] = useState(true)
  const [priceType, setPriceType] = useState<'fixed' | 'split' | 'free'>('split')
  const [followupAnswers, setFollowupAnswers] = useState<Record<string, string>>({})
  const [pickupLocation, setPickupLocation] = useState<ResolvedLocation | null>(null)
  const [dropoffLocation, setDropoffLocation] = useState<ResolvedLocation | null>(null)
  const [intentType, setIntentType] = useState<IntentType | null>(null)
  const [lockedIntent, setLockedIntent] = useState(false)
  const [clarificationCount, setClarificationCount] = useState(0)

  const mergedSD = useMemo<Record<string, unknown>>(() => {
    if (!parsed) return {}
    return applyFollowupAnswers(parsed.structured_data ?? {}, followupAnswers)
  }, [parsed, followupAnswers])

  // Follow-up questions to show: only those the parser didn't extract.
  const followupQuestionsToShow = useMemo<FollowUpQuestion[]>(() => {
    if (!parsed) return []
    const questions = FOLLOWUP_QUESTIONS[parsed.category] ?? []
    const sd = parsed.structured_data
    if (!sd) return questions
    return questions.filter(q => sd[q.key] === null || sd[q.key] === undefined)
  }, [parsed])

  // Gates the Confirm button — all critical fields must be filled.
  const canConfirm = useMemo<boolean>(() => {
    if (!parsed) return false
    if (parsed.category === 'rides') {
      return pickupLocation !== null && dropoffLocation !== null
    }
    if (parsed.category === 'errands') {
      if (!pickupLocation) return false
      const errandType = mergedSD.errand_type as string | null | undefined
      if (!errandType) return false
      if (errandType !== 'food_pickup' && !mergedSD.task_details) return false
      return true
    }
    if (parsed.category === 'moving') {
      if (!pickupLocation) return false
      if (!mergedSD.helpers_needed) return false
      const moveType = mergedSD.move_type as string | null | undefined
      if (moveType !== 'furniture' && !dropoffLocation) return false
      return true
    }
    const criticals = CRITICAL_FIELDS[parsed.category] ?? []
    if (criticals.length === 0) return true
    return criticals.every(key => {
      const val = mergedSD[key]
      return val !== null && val !== undefined && val !== ''
    })
  }, [parsed, mergedSD, followupAnswers, pickupLocation, dropoffLocation])

  // Typewriter placeholder animation
  const [phIdx, setPhIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing')

  useEffect(() => {
    if (text || focused) return
    const target = PLACEHOLDERS[phIdx]
    let timer: ReturnType<typeof setTimeout>
    if (phase === 'typing') {
      if (displayed.length < target.length) {
        timer = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 55)
      } else {
        timer = setTimeout(() => setPhase('pausing'), 2400)
      }
    } else if (phase === 'pausing') {
      timer = setTimeout(() => setPhase('deleting'), 0)
    } else {
      if (displayed.length > 0) {
        timer = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 28)
      } else {
        setPhIdx((i) => (i + 1) % PLACEHOLDERS.length)
        setPhase('typing')
      }
    }
    return () => clearTimeout(timer)
  }, [displayed, phase, phIdx, text, focused])

  // ─── Shared parse handler (used by both initial submit and clarification re-parse) ──

  function applyParsedResult(data: ParsedRequest) {
    // Non-ride offer: show interstitial
    if (data.is_offer && data.category !== 'rides') {
      setParsed(data)
      setStatus('confirm') // JSX checks is_offer to render interstitial
      return
    }
    // Ambiguous intent: ask for clarification — but only once.
    // If intent is already locked (user already chose a disambiguation option),
    // skip disambiguation and proceed directly to confirm.
    if (data.ambiguous && data.clarification_options?.length && clarificationCount === 0) {
      setParsed(data)
      setClarificationCount(1)
      setStatus('disambiguating')
      return
    }
    // Normal confirm flow
    setParsed(data)
    setPriceType(data.price_type ?? 'split')
    setStatus('confirm')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || status === 'parsing') return
    setError(null)
    setStatus('parsing')
    setParsed(null)
    setAutoAccept(true)
    setFollowupAnswers({})
    setPickupLocation(null)
    setDropoffLocation(null)
    setIntentType(null)
    setLockedIntent(false)
    setClarificationCount(0)

    const res = await fetch('/api/parse-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) {
      setError('Failed to parse your request. Please try again.')
      setStatus('idle')
      return
    }

    const data = await res.json()
    if (!data.category || !data.title) {
      setError('Could not understand your request. Try being more specific.')
      setStatus('idle')
      return
    }

    applyParsedResult(data)
  }

  // State-machine transition for a disambiguation choice.
  // Infers intent client-side and either shows the unsupported interstitial or
  // transitions directly to the confirm card — never re-invokes the parser.
  function handleDisambigSelect(opt: { label: string; appended_text: string }) {
    if (!parsed) return
    setError(null)

    const inferred = inferIntentFromOption(opt.appended_text, parsed.category, parsed.is_offer)
    setIntentType(inferred.intentType)
    setLockedIntent(true)

    // Unsupported intent: show the interstitial (reuse is_offer interstitial slot).
    if (inferred.intentType in UNSUPPORTED_MESSAGES) {
      setParsed({ ...parsed, is_offer: true, category: inferred.category })
      setStatus('confirm')
      return
    }

    // Supported intent: merge the chosen option into parsed state and show confirm.
    // Override is_offer and category so the confirm card renders correctly.
    const updatedParsed: ParsedRequest = {
      ...parsed,
      category: inferred.category,
      is_offer: inferred.isOffer,
      ambiguous: false,
    }
    setParsed(updatedParsed)
    setPriceType(updatedParsed.price_type ?? 'split')
    setStatus('confirm')
  }

  async function handleConfirm() {
    if (!parsed) return
    setError(null)
    setStatus('saving')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Session expired. Please refresh.')
      setStatus('confirm')
      return
    }

    // Merge parser summary into structured_data so it's persisted alongside other fields.
    const sdBase = {
      ...(parsed.structured_data ?? {}),
      ...(parsed.summary ? { summary: parsed.summary } : {}),
    }
    // Exclude ride location keys — they go to top-level columns, not structured_data.
    const sdFollowupAnswers = parsed.category === 'rides'
      ? Object.fromEntries(
          Object.entries(followupAnswers).filter(([k]) => k !== 'origin_city' && k !== 'destination_city')
        )
      : followupAnswers
    const sdMerged = applyFollowupAnswers(sdBase, sdFollowupAnswers)
    const hasStructuredData = Object.values(sdMerged).some(v => v !== null && v !== undefined)
    const structuredDataToSave = hasStructuredData ? sdMerged : null

    const isDriverNonFixed = parsed.category === 'rides' && parsed.is_driver && priceType !== 'fixed'

    const payload: Record<string, unknown> = {
      requester_id: user.id,
      category: parsed.category,
      title: parsed.title,
      description: text.trim() || null,
      urgency: parsed.urgency,
      ...(parsed.location != null && { location: parsed.location }),
      ...(parsed.scheduled_time != null && { scheduled_time: parsed.scheduled_time }),
      ...(!isDriverNonFixed && parsed.budget != null && { budget: parsed.budget }),
      ...(structuredDataToSave != null && { structured_data: structuredDataToSave }),
      ...(parsed.category === 'rides' && {
        pickup_location: pickupLocation ?? null,
        dropoff_location: dropoffLocation ?? null,
        origin_city: pickupLocation?.place_name ?? parsed.origin_city ?? null,
        destination_city: dropoffLocation?.place_name ?? parsed.destination_city ?? null,
        is_driver: parsed.is_driver ?? null,
        available_seats: parsed.available_seats ?? null,
        is_round_trip: parsed.is_round_trip ?? false,
        return_date: parsed.return_date ?? null,
        flexible_time: parsed.flexible_time ?? false,
        auto_accept: parsed.is_driver ? autoAccept : true,
        price_type: parsed.is_driver ? priceType : null,
        is_airport_ride: parsed.is_airport_ride ?? false,
      }),
      ...(parsed.category === 'errands' && {
        pickup_location: pickupLocation ?? null,
      }),
      ...(parsed.category === 'moving' && {
        pickup_location: pickupLocation ?? null,
        dropoff_location: dropoffLocation ?? null,
      }),
    }

    let { error: dbError } = await supabase.from('requests').insert(payload)

    if (dbError && /schema cache|Could not find the/i.test(dbError.message)) {
      const fallback = { ...payload }
      delete fallback.auto_accept
      delete fallback.price_type
      delete fallback.is_airport_ride
      delete fallback.structured_data
      delete fallback.pickup_location
      delete fallback.dropoff_location
      ;({ error: dbError } = await supabase.from('requests').insert(fallback))
    }

    if (dbError) {
      setError(dbError.message)
      setStatus('confirm')
      return
    }

    setParsed(null)
    setText('')
    setFollowupAnswers({})
    setPickupLocation(null)
    setDropoffLocation(null)
    setStatus('done')
    router.refresh()
    setTimeout(() => setStatus('idle'), 3000)
  }

  function handleEdit() {
    setError(null)
    setStatus('idle')
    setParsed(null)
    setFollowupAnswers({})
    setPickupLocation(null)
    setDropoffLocation(null)
    setIntentType(null)
    setLockedIntent(false)
    setClarificationCount(0)
  }

  function handleFollowupChange(key: string, value: string) {
    setFollowupAnswers(prev => ({ ...prev, [key]: value }))
  }

  const showCard = (status === 'confirm' || status === 'saving') && parsed !== null
  const isOfferInterstitial = showCard && !!parsed?.is_offer && parsed.category !== 'rides'
  const showConfirmCard = showCard && !isOfferInterstitial
  const busy = status === 'parsing' || status === 'saving'

  return (
    <section className="flex flex-col items-center gap-7">
      {/* Gradient headline */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          <span
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 50%, #93c5fd 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            What do you need help with?
          </span>
        </h1>
        <p className="text-sm text-slate-500">
          Describe your request and CampusOS will find someone to help
        </p>
      </div>

      {/* AI input */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div
          className="relative rounded-2xl border bg-[#0d1526] transition-all duration-300"
          style={{
            borderColor: focused ? 'rgba(59,130,246,0.5)' : '#1e2d4a',
            boxShadow: focused
              ? '0 0 0 1px rgba(59,130,246,0.15), 0 0 32px rgba(59,130,246,0.10)'
              : '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          {!text && !focused && (
            <div
              aria-hidden="true"
              className="absolute left-4 top-3 pointer-events-none select-none text-sm text-slate-600"
            >
              {displayed}
              <span className="animate-pulse opacity-70">|</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            data-testid="request-textarea"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={busy}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-white outline-none disabled:opacity-60"
          />

          <div className="flex items-center justify-between px-3 pb-3">
            <span className="text-xs text-slate-600">
              {text.length > 0 ? `${text.length} chars` : 'Powered by Claude AI'}
            </span>
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === 'parsing' ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Parsing…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
                  </svg>
                  Post request
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Category pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {CATEGORIES.map(({ label, icon, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setText(STARTERS[value])
              textareaRef.current?.focus()
            }}
            className="flex items-center gap-1.5 rounded-full border border-[#1e2d4a] bg-[#0d1526] px-4 py-2 text-sm text-slate-400 transition-all hover:border-blue-500/30 hover:bg-blue-500/[0.08] hover:text-blue-300"
          >
            <span className="text-base leading-none">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error !== null && (
        <div className="w-full max-w-2xl rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Success */}
      {status === 'done' && (
        <div className="w-full max-w-2xl rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-400">
          Request posted! Looking for helpers nearby…
        </div>
      )}

      {/* ── Disambiguation card — parser flagged ambiguous intent ── */}
      {status === 'disambiguating' && parsed && (
        <div data-testid="disambig-card" className="w-full max-w-2xl rounded-2xl border border-blue-500/20 bg-[#0d1526] p-6 shadow-2xl shadow-black/40">
          <p className="text-sm font-semibold text-white mb-1">
            {parsed.clarification_question ?? 'What do you need?'}
          </p>
          <p className="text-xs text-slate-500 mb-4">Choose the closest match — you can add details after.</p>
          <div className="flex flex-col gap-2">
            {(parsed.clarification_options ?? []).map(opt => (
              <button
                key={opt.appended_text}
                data-testid="disambig-option"
                type="button"
                onClick={() => handleDisambigSelect(opt)}
                className="flex items-center gap-3 rounded-xl border border-[#1e2d4a] bg-white/[0.02] px-4 py-3 text-sm text-slate-300 text-left transition-all hover:border-blue-500/30 hover:bg-blue-500/[0.05] hover:text-white"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleEdit}
            className="mt-4 text-xs text-slate-600 hover:text-slate-400 transition-colors w-full text-center"
          >
            Edit my message
          </button>
        </div>
      )}

      {/* ── Offer interstitial — non-ride offer posts not yet supported ── */}
      {isOfferInterstitial && (
        <div data-testid="offer-interstitial" className="w-full max-w-2xl rounded-2xl border border-purple-500/15 bg-[#0d1526] p-6 shadow-2xl shadow-black/40">
          <p className="text-base font-semibold text-white mb-2">Looks like you&apos;re offering help</p>
          <p className="text-sm text-slate-400 leading-relaxed mb-5">
            {(intentType && UNSUPPORTED_MESSAGES[intentType]) ??
              'Offer availability posts are launching soon. For now, browse the feed and respond directly to students who need what you can provide.'}
          </p>
          <div className="flex gap-3">
            <a
              href="#feed"
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white text-center transition-colors hover:bg-blue-500"
            >
              Browse requests →
            </a>
            <button
              type="button"
              onClick={handleEdit}
              className="rounded-lg border border-[#1e2d4a] px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmation card ── */}
      {showConfirmCard && (
        <div className="w-full max-w-2xl rounded-2xl border border-[#1e2d4a] bg-[#0d1526] p-6 shadow-2xl shadow-black/40">

          {/* Follow-up questions (non-rides, only when parser left fields null) */}
          {followupQuestionsToShow.length > 0 && (
            <div className="mb-6 rounded-xl border border-blue-500/15 bg-blue-500/[0.05] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400/70 mb-3">
                A few details
              </p>
              <div className="flex flex-col gap-4">
                {followupQuestionsToShow.map(q => (
                  <div key={q.key}>
                    <p className="text-xs font-medium text-slate-300 mb-1">{q.label}</p>
                    {q.hint && (
                      <p className="text-[10px] text-slate-600 mb-1.5">{q.hint}</p>
                    )}
                    {q.type === 'chips' ? (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              handleFollowupChange(
                                q.key,
                                followupAnswers[q.key] === opt.value ? '' : opt.value,
                              )
                            }
                            className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
                              followupAnswers[q.key] === opt.value
                                ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                                : 'border-[#1e2d4a] text-slate-500 hover:border-blue-500/30 hover:text-slate-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        data-testid={`followup-text-${q.key}`}
                        type="text"
                        value={followupAnswers[q.key] ?? ''}
                        onChange={e => handleFollowupChange(q.key, e.target.value)}
                        placeholder={q.placeholder}
                        className="w-full rounded-lg border border-[#1e2d4a] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500/40"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parsed summary — natural language from parser */}
          <p className="mb-1 text-sm font-medium text-slate-300">
            Here&apos;s what we understood — does this look right?
          </p>
          {parsed!.summary && (
            <p data-testid="summary-text" className="mb-4 text-sm text-slate-500 italic leading-relaxed">
              &ldquo;{parsed!.summary}&rdquo;
            </p>
          )}

          <div className="mb-5 flex flex-col gap-3">
            <Row label="Category" value={CATEGORY_LABELS[parsed!.category]} />
            <Row label="Title" value={parsed!.title} />

            {/* ── RIDES-specific rows ── */}
            {parsed!.category === 'rides' && (
              <>
                {/* Location pickers — both required before confirm unlocks */}
                <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/60 mb-3">
                    Route — select specific locations
                  </p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-300 mb-1.5">Pickup / From</p>
                      <LocationPicker
                        value={pickupLocation}
                        onChange={setPickupLocation}
                        hint={parsed!.origin_city ?? undefined}
                        placeholder="Search dorm, building, or address…"
                        data-testid="location-picker-pickup"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-300 mb-1.5">Dropoff / To</p>
                      <LocationPicker
                        value={dropoffLocation}
                        onChange={setDropoffLocation}
                        hint={parsed!.destination_city ?? undefined}
                        placeholder="Search destination or address…"
                        data-testid="location-picker-dropoff"
                      />
                    </div>
                  </div>
                </div>

                {parsed!.is_driver !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Role</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      parsed!.is_driver
                        ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                        : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                    }`}>
                      {parsed!.is_driver ? '🚗 Offering a ride' : '🙋 Looking for a ride'}
                    </span>
                  </div>
                )}
                {parsed!.is_driver && parsed!.available_seats != null && (
                  <Row label="Seats available" value={String(parsed!.available_seats)} />
                )}
                {parsed!.is_round_trip && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Round trip</span>
                    <span className="text-sm text-white">
                      Yes{parsed!.return_date ? ` · return ${new Date(parsed!.return_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                    </span>
                  </div>
                )}
                {parsed!.flexible_time && (
                  <Row
                    label="Time"
                    value={parsed!.scheduled_time
                      ? `${new Date(parsed!.scheduled_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · Flexible`
                      : 'Flexible'}
                  />
                )}

                {/* Pricing — drivers only */}
                {parsed!.is_driver && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-xs text-slate-500">Pricing</span>
                    <div className="flex gap-2">
                      {(['split', 'fixed', 'free'] as const).map(pt => (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => setPriceType(pt)}
                          className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                            priceType === pt
                              ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                              : 'border-[#1e2d4a] text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {pt === 'split' ? '⛽ Split gas' : pt === 'fixed' ? '💰 Fixed' : '🎁 Free'}
                        </button>
                      ))}
                    </div>
                    {priceType === 'fixed' && parsed!.budget != null && (
                      <p className="text-[11px] text-slate-500">${parsed!.budget} / seat</p>
                    )}
                  </div>
                )}

                {/* Auto-accept toggle — drivers only */}
                {parsed!.is_driver && (
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-400 font-medium">
                        {autoAccept ? 'Auto-accept passengers' : 'Manually approve each passenger'}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        {autoAccept
                          ? 'Passengers are auto-confirmed until seats fill'
                          : 'You review and approve each request'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoAccept(v => !v)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        autoAccept ? 'bg-blue-600' : 'bg-slate-700'
                      }`}
                      role="switch"
                      aria-checked={autoAccept}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          autoAccept ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── MOVING structured rows ── */}
            {parsed!.category === 'moving' && (
              <>
                <div className="rounded-xl border border-orange-500/15 bg-orange-500/[0.04] px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-400/60 mb-3">
                    Locations
                  </p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-300 mb-1.5">From — where items are now</p>
                      <LocationPicker
                        value={pickupLocation}
                        onChange={setPickupLocation}
                        placeholder="Search dorm, address, or building…"
                        data-testid="location-picker-pickup"
                      />
                    </div>
                    {(mergedSD.move_type as string | null | undefined) !== 'furniture' && (
                      <div>
                        <p className="text-xs font-medium text-slate-300 mb-1.5">To — where items are going</p>
                        <LocationPicker
                          value={dropoffLocation}
                          onChange={setDropoffLocation}
                          placeholder="Search destination address or building…"
                          data-testid="location-picker-dropoff"
                        />
                      </div>
                    )}
                  </div>
                </div>
                {mergedSD.helpers_needed != null && (
                  <Row label="Helpers needed" value={`${mergedSD.helpers_needed}`} />
                )}
                {mergedSD.access_type && (
                  <Row label="Access" value={ACCESS_LABELS[mergedSD.access_type as string] ?? String(mergedSD.access_type)} />
                )}
                {mergedSD.truck_needed === true && (
                  <Row label="Truck needed" value="Yes" />
                )}
                {mergedSD.estimated_duration && (
                  <Row label="Est. duration" value={mergedSD.estimated_duration as string} />
                )}
              </>
            )}

            {/* ── PEER HELP structured rows ── */}
            {parsed!.category === 'peer_help' && (
              <>
                {mergedSD.subject && (
                  <Row label="Subject" value={mergedSD.subject as string} />
                )}
                {mergedSD.help_type && (
                  <Row label="Help type" value={HELP_TYPE_LABELS[mergedSD.help_type as string] ?? String(mergedSD.help_type)} />
                )}
                {mergedSD.is_virtual !== null && mergedSD.is_virtual !== undefined && (
                  <Row
                    label="Format"
                    value={VIRTUAL_LABELS[String(mergedSD.is_virtual)] ?? String(mergedSD.is_virtual)}
                  />
                )}
              </>
            )}

            {/* ── ERRANDS structured rows ── */}
            {parsed!.category === 'errands' && (
              <>
                {mergedSD.errand_type === 'grocery' && (
                  <div data-testid="grocery-scope-warning" className="rounded-lg border border-yellow-500/20 bg-yellow-500/[0.06] px-4 py-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-medium text-yellow-400">Beta note:</span>{' '}
                      CampusOS errands are for quick pickups — not full grocery shopping. Keep lists small and simple.
                    </p>
                  </div>
                )}
                {mergedSD.errand_type && (
                  <Row label="Errand type" value={ERRAND_TYPE_LABELS[mergedSD.errand_type as string] ?? String(mergedSD.errand_type)} />
                )}
                <div className="rounded-xl border border-purple-500/15 bg-purple-500/[0.04] px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-400/60 mb-3">
                    Pickup location
                  </p>
                  <LocationPicker
                    value={pickupLocation}
                    onChange={setPickupLocation}
                    hint={typeof mergedSD.store_or_place === 'string' ? mergedSD.store_or_place : undefined}
                    placeholder="Search store, restaurant, or address…"
                    data-testid="location-picker-pickup"
                  />
                </div>
                {mergedSD.task_details && (
                  <Row label="Task" value={mergedSD.task_details as string} />
                )}
                {mergedSD.reimbursement_type && (
                  <Row
                    data-testid="payment-label"
                    label="Payment"
                    value={REIMBURSEMENT_LABELS[mergedSD.reimbursement_type as string] ?? String(mergedSD.reimbursement_type)}
                  />
                )}
              </>
            )}

            {/* ── BORROW structured rows ── */}
            {parsed!.category === 'borrow' && (
              <>
                {mergedSD.item && (
                  <Row label="Item" value={mergedSD.item as string} />
                )}
                {mergedSD.borrow_duration && (
                  <Row label="Duration" value={mergedSD.borrow_duration as string} />
                )}
              </>
            )}

            {/* ── Generic rows for all categories ── */}
            {!parsed!.origin_city && parsed!.location && (
              <Row label="Location" value={parsed!.location} />
            )}
            {parsed!.scheduled_time && !parsed!.flexible_time && (
              <Row
                label="Time"
                value={new Date(parsed!.scheduled_time).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              />
            )}
            {parsed!.budget != null && !(parsed!.category === 'rides' && parsed!.is_driver) && (
              <Row label="Budget" value={`$${parsed!.budget}`} />
            )}
            {parsed!.helper_requirements && (
              <Row label="Requirements" value={parsed!.helper_requirements} />
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Urgency</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${URGENCY_COLORS[parsed!.urgency]}`}>
                {parsed!.urgency}
              </span>
            </div>
          </div>

          {/* Rides safety reminder */}
          {parsed!.category === 'rides' && (
            <div className="mb-4 rounded-lg border border-blue-500/15 bg-blue-500/[0.05] px-4 py-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="font-medium text-slate-300">Rides reminder:</span>{' '}
                CampusOS connects you with other students — we don&apos;t vet drivers or provide insurance.
                Confirm all details directly with the other student before your trip.{' '}
                <a href="/safety" target="_blank" rel="noopener" className="text-blue-400 hover:underline">
                  Safety tips →
                </a>
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              data-testid="confirm-post-btn"
              onClick={handleConfirm}
              disabled={status === 'saving' || !canConfirm}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'saving' ? 'Saving…' : 'Confirm & post'}
            </button>
            <button
              onClick={handleEdit}
              disabled={status === 'saving'}
              className="rounded-lg border border-[#1e2d4a] px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              Edit
            </button>
          </div>
          {!canConfirm && status !== 'saving' && (
            <p className="mt-2 text-center text-[11px] text-slate-600">
              Add the missing details above to post
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function Row({ label, value, 'data-testid': testId }: { label: string; value: string; 'data-testid'?: string }) {
  return (
    <div data-testid={testId} className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm text-white">{value}</span>
    </div>
  )
}
