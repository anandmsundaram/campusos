'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

export default function RequestInput() {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'confirm' | 'saving' | 'done'>('idle')
  const [parsed, setParsed] = useState<ParsedRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showWhatsApp, setShowWhatsApp] = useState(false)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || status === 'parsing') return
    setError(null)
    setStatus('parsing')
    setParsed(null)

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

    setParsed(data)
    setStatus('confirm')
  }

  async function handleConfirm() {
    if (!parsed) return
    setError(null)
    setStatus('saving')

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Session expired. Please refresh.')
      setStatus('confirm')
      return
    }

    const { error: dbError } = await supabase.from('requests').insert({
      requester_id: user.id,
      category: parsed.category,
      title: parsed.title,
      location: parsed.location ?? undefined,
      scheduled_time: parsed.scheduled_time ?? undefined,
      urgency: parsed.urgency,
      budget: parsed.budget ?? undefined,
      ...(parsed.category === 'rides' && {
        origin_city: parsed.origin_city ?? undefined,
        destination_city: parsed.destination_city ?? undefined,
        is_driver: parsed.is_driver ?? undefined,
        available_seats: parsed.available_seats ?? undefined,
        is_round_trip: parsed.is_round_trip ?? false,
        return_date: parsed.return_date ?? undefined,
        flexible_time: parsed.flexible_time ?? false,
      }),
    })

    if (dbError) {
      setError(dbError.message)
      setStatus('confirm')
      return
    }

    setParsed(null)
    setText('')
    setStatus('done')
    router.refresh()
    setTimeout(() => setStatus('idle'), 3000)
  }

  function handleEdit() {
    setError(null)
    setStatus('idle')
    setParsed(null)
  }

  const showCard = (status === 'confirm' || status === 'saving') && parsed !== null
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
          {/* Typewriter placeholder overlay */}
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

      {/* Category pills + WhatsApp import */}
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
        <button
          type="button"
          onClick={() => setShowWhatsApp(true)}
          className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-sm text-emerald-400 transition-all hover:bg-emerald-500/[0.12] hover:border-emerald-500/40"
        >
          <span className="text-base leading-none">💬</span>
          <span>Import from WhatsApp</span>
        </button>
      </div>

      {showWhatsApp && (
        <WhatsAppImportModal
          onClose={() => setShowWhatsApp(false)}
          onImported={() => { setShowWhatsApp(false); router.refresh() }}
        />
      )}

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

      {/* Confirmation card */}
      {showCard && (
        <div className="w-full max-w-2xl rounded-2xl border border-[#1e2d4a] bg-[#0d1526] p-6 shadow-2xl shadow-black/40">
          <p className="mb-5 text-sm font-medium text-slate-300">
            Here&apos;s what we understood — does this look right?
          </p>

          <div className="mb-5 flex flex-col gap-3">
            <Row label="Category" value={CATEGORY_LABELS[parsed!.category]} />
            <Row label="Title" value={parsed!.title} />

            {/* Ride-specific fields */}
            {parsed!.category === 'rides' && (
              <>
                {parsed!.origin_city && parsed!.destination_city && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Route</span>
                    <span className="flex items-center gap-2 text-sm text-white">
                      <span>{parsed!.origin_city}</span>
                      <span className="text-slate-500">→</span>
                      <span>{parsed!.destination_city}</span>
                    </span>
                  </div>
                )}
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
                  <Row label="Time" value="Flexible" />
                )}
              </>
            )}

            {!parsed!.origin_city && parsed!.location && <Row label="Location" value={parsed!.location} />}
            {parsed!.scheduled_time && !parsed!.flexible_time && (
              <Row
                label="Time"
                value={new Date(parsed!.scheduled_time).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              />
            )}
            {parsed!.budget != null && <Row label="Budget" value={`$${parsed!.budget}`} />}
            {parsed!.helper_requirements && (
              <Row label="Requirements" value={parsed!.helper_requirements} />
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Urgency</span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${URGENCY_COLORS[parsed!.urgency]}`}
              >
                {parsed!.urgency}
              </span>
            </div>
          </div>

          {parsed!.missing_fields.length > 0 && (
            <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.08] px-4 py-3">
              <p className="text-xs text-yellow-400">
                <span className="font-medium">Heads up:</span> we couldn&apos;t find{' '}
                {parsed!.missing_fields.join(', ')}. You can add these later.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={status === 'saving'}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
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
        </div>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm text-white">{value}</span>
    </div>
  )
}

function WhatsAppImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [waText, setWaText] = useState('')
  const [waStatus, setWaStatus] = useState<'idle' | 'parsing' | 'confirm' | 'saving'>('idle')
  const [waParsed, setWaParsed] = useState<ParsedRequest | null>(null)
  const [waError, setWaError] = useState<string | null>(null)

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    if (!waText.trim()) return
    setWaError(null)
    setWaStatus('parsing')

    const res = await fetch('/api/parse-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: waText, source: 'whatsapp' }),
    })

    if (!res.ok) { setWaError('Failed to parse. Try again.'); setWaStatus('idle'); return }
    const data = await res.json()
    if (!data.category || !data.title) { setWaError('Could not understand the request. Be more specific.'); setWaStatus('idle'); return }

    setWaParsed(data)
    setWaStatus('confirm')
  }

  async function handleConfirm() {
    if (!waParsed) return
    setWaStatus('saving')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setWaError('Session expired.'); setWaStatus('confirm'); return }

    const { error } = await supabase.from('requests').insert({
      requester_id: user.id,
      category: waParsed.category,
      title: waParsed.title,
      location: waParsed.location ?? undefined,
      scheduled_time: waParsed.scheduled_time ?? undefined,
      urgency: waParsed.urgency,
      budget: waParsed.budget ?? undefined,
      ...(waParsed.category === 'rides' && {
        origin_city: waParsed.origin_city ?? undefined,
        destination_city: waParsed.destination_city ?? undefined,
        is_driver: waParsed.is_driver ?? undefined,
        available_seats: waParsed.available_seats ?? undefined,
        is_round_trip: waParsed.is_round_trip ?? false,
        return_date: waParsed.return_date ?? undefined,
        flexible_time: waParsed.flexible_time ?? false,
      }),
    })

    if (error) { setWaError(error.message); setWaStatus('confirm'); return }
    onImported()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-emerald-500/20 bg-[#0a0f1e] p-6 shadow-2xl shadow-black/60">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
        >
          ✕
        </button>

        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-xl">💬</span>
          <h3 className="text-sm font-semibold text-white">Import from WhatsApp</h3>
        </div>
        <p className="mb-5 text-xs text-slate-500">Paste a message from WhatsApp and we&apos;ll extract the request details.</p>

        {waStatus === 'idle' || waStatus === 'parsing' ? (
          <form onSubmit={handleParse} className="flex flex-col gap-4">
            <textarea
              rows={5}
              value={waText}
              onChange={e => setWaText(e.target.value)}
              placeholder="e.g. hey anyone going to DFW this Friday morning? need a ride from UTD, willing to pay gas money"
              disabled={waStatus === 'parsing'}
              className="w-full resize-none rounded-xl border border-[#1e2d4a] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-emerald-500/40 disabled:opacity-60"
            />
            {waError && <p className="text-xs text-red-400">{waError}</p>}
            <button
              type="submit"
              disabled={!waText.trim() || waStatus === 'parsing'}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            >
              {waStatus === 'parsing' ? 'Parsing…' : 'Parse request'}
            </button>
          </form>
        ) : waParsed ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-xl border border-[#1e2d4a] bg-white/[0.02] p-4">
              <Row label="Category" value={CATEGORY_LABELS[waParsed.category]} />
              <Row label="Title" value={waParsed.title} />
              {waParsed.category === 'rides' && waParsed.origin_city && waParsed.destination_city && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Route</span>
                  <span className="flex items-center gap-2 text-sm text-white">
                    <span>{waParsed.origin_city}</span>
                    <span className="text-slate-500">→</span>
                    <span>{waParsed.destination_city}</span>
                  </span>
                </div>
              )}
              {waParsed.is_driver !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Role</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${waParsed.is_driver ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-purple-400 bg-purple-500/10 border-purple-500/20'}`}>
                    {waParsed.is_driver ? '🚗 Offering a ride' : '🙋 Looking for a ride'}
                  </span>
                </div>
              )}
              {waParsed.location && !waParsed.origin_city && <Row label="Location" value={waParsed.location} />}
              {waParsed.scheduled_time && <Row label="Time" value={new Date(waParsed.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} />}
              {waParsed.budget != null && <Row label="Budget" value={`$${waParsed.budget}`} />}
            </div>
            {waError && <p className="text-xs text-red-400">{waError}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={waStatus === 'saving'}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {waStatus === 'saving' ? 'Posting…' : 'Post request'}
              </button>
              <button
                onClick={() => { setWaStatus('idle'); setWaParsed(null) }}
                disabled={waStatus === 'saving'}
                className="rounded-xl border border-[#1e2d4a] px-4 py-2.5 text-sm text-slate-400 hover:text-white disabled:opacity-40"
              >
                Edit
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
