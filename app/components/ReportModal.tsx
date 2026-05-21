'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const REASONS = [
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'harassment',            label: 'Harassment or threatening behavior' },
  { value: 'scam_fraud',            label: 'Scam or fraud' },
  { value: 'safety_concern',        label: 'Safety concern' },
  { value: 'spam',                  label: 'Spam' },
  { value: 'other',                 label: 'Other' },
] as const

type Reason = typeof REASONS[number]['value']

interface Props {
  targetType: 'request' | 'offer' | 'user' | 'message_thread'
  targetId: string
  displayName?: string
  onClose: () => void
}

const TARGET_LABELS: Record<Props['targetType'], string> = {
  request:        'request',
  offer:          'offer',
  user:           'user',
  message_thread: 'conversation',
}

export default function ReportModal({ targetType, targetId, displayName, onClose }: Props) {
  const [reason, setReason]       = useState<Reason | ''>('')
  const [details, setDetails]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason || submitting) return
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('You must be signed in to file a report.'); setSubmitting(false); return }

    const { error: dbError } = await supabase.from('reports').insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id:   targetId,
      reason,
      details:     details.trim() || null,
    })

    if (dbError) {
      setError('Failed to submit report. Please try again or email campusosapp@gmail.com.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  const label = TARGET_LABELS[targetType]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#1e2d4a] bg-[#0d1526] p-6 shadow-2xl shadow-black/60">
        {/* Close */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Report {displayName ? `"${displayName}"` : `this ${label}`}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Reports are reviewed by the CampusOS team.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-slate-600 hover:text-slate-400 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="text-3xl">✓</span>
            <p className="text-sm font-semibold text-white">Report submitted</p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              Thanks for helping keep CampusOS safe. We review all reports and take action when guidelines are violated.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg bg-[#1e2d4a] px-5 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.08] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Reason */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Reason</label>
              <select
                required
                value={reason}
                onChange={(e) => setReason(e.target.value as Reason)}
                disabled={submitting}
                className="w-full rounded-lg border border-[#1e2d4a] bg-[#060b17] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-50 cursor-pointer appearance-none"
              >
                <option value="" disabled className="bg-[#0d1526]">Select a reason…</option>
                {REASONS.map(r => (
                  <option key={r.value} value={r.value} className="bg-[#0d1526]">{r.label}</option>
                ))}
              </select>
            </div>

            {/* Details */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">
                Additional details <span className="text-slate-600">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                disabled={submitting}
                placeholder="Describe what happened…"
                className="w-full resize-none rounded-lg border border-[#1e2d4a] bg-[#060b17] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500/50 disabled:opacity-50"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!reason || submitting}
                className="flex-1 rounded-lg bg-red-600/80 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Submit report'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border border-[#1e2d4a] px-4 py-2.5 text-xs font-medium text-slate-400 hover:border-white/20 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
