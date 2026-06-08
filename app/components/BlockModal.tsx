'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { blockUser } from '@/lib/blocking'

const BLOCK_REASONS = [
  { value: 'harassment',    label: 'Harassment or threatening behavior' },
  { value: 'scam_fraud',    label: 'Scam or fraud' },
  { value: 'inappropriate', label: 'Inappropriate behavior' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'other',         label: 'Other' },
] as const

type BlockReason = typeof BLOCK_REASONS[number]['value']

interface Props {
  targetUserId: string
  displayName?: string
  onClose: () => void
  onBlocked?: () => void
}

export default function BlockModal({ targetUserId, displayName, onClose, onBlocked }: Props) {
  const [reason, setReason]       = useState<BlockReason | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason || submitting) return
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const result = await blockUser(supabase, targetUserId, reason)

    if (!result.ok) {
      setError(result.error ?? 'Failed to block user. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
    onBlocked?.()
  }

  const name = displayName ? `"${displayName}"` : 'this user'

  return (
    <div
      data-testid="block-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#1e2d4a] bg-[#0d1526] p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Block {name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              They won&apos;t be able to interact with your requests.
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
            <span className="text-3xl">🚫</span>
            <p className="text-sm font-semibold text-white">User blocked</p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              {displayName ? `${displayName} has` : 'This user has'} been blocked. You can manage blocked users in your account settings.
            </p>
            <button
              type="button"
              data-testid="block-modal-done"
              onClick={onClose}
              className="mt-2 rounded-lg bg-[#1e2d4a] px-5 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.08] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">
                Reason <span className="text-red-400">*</span>
              </label>
              <select
                required
                data-testid="block-reason-select"
                value={reason}
                onChange={(e) => setReason(e.target.value as BlockReason)}
                disabled={submitting}
                className="w-full rounded-lg border border-[#1e2d4a] bg-[#060b17] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-50 cursor-pointer appearance-none"
              >
                <option value="" disabled className="bg-[#0d1526]">Select a reason…</option>
                {BLOCK_REASONS.map(r => (
                  <option key={r.value} value={r.value} className="bg-[#0d1526]">{r.label}</option>
                ))}
              </select>
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                data-testid="block-submit-btn"
                disabled={!reason || submitting}
                className="flex-1 rounded-lg bg-red-700/80 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Blocking…' : 'Block user'}
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
