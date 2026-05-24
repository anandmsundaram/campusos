'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { storeTermsAcceptance } from '@/lib/terms'

interface Props {
  onAccepted: () => void
  onDismiss: () => void
  /** Identifies which action triggered this gate (for stored metadata). */
  source?: string
}

export default function TermsModal({ onAccepted, onDismiss, source }: Props) {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleAccept() {
    if (!checked || loading) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: storeErr } = await storeTermsAcceptance(supabase, source)

    if (storeErr) {
      setError('Could not save acceptance. Please try again.')
      setLoading(false)
      return
    }

    setLoading(false)
    onAccepted()
  }

  return (
    <div
      data-testid="terms-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#1e2d4a] bg-[#0a0f1e] p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="text-lg font-bold text-white mb-2">Before you continue</h2>
        <p className="text-sm text-slate-400 leading-relaxed mb-5">
          CampusOS is a peer-to-peer coordination platform. Payments are handled
          directly between students during beta — CampusOS does not process or
          guarantee any payments.
        </p>

        {/* Links */}
        <div className="mb-5 flex flex-col gap-2.5">
          <a
            data-testid="terms-link"
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span className="text-base">📄</span> Terms of Service
            <span className="ml-auto text-slate-600 text-xs">↗</span>
          </a>
          <a
            data-testid="privacy-link"
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span className="text-base">🔒</span> Privacy Policy
            <span className="ml-auto text-slate-600 text-xs">↗</span>
          </a>
          <a
            data-testid="guidelines-link"
            href="/guidelines"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span className="text-base">📋</span> Community Guidelines
            <span className="ml-auto text-slate-600 text-xs">↗</span>
          </a>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer mb-6 select-none">
          <input
            data-testid="terms-checkbox"
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-slate-300 leading-snug">
            I agree to the Terms of Service, Privacy Policy, and Community
            Guidelines.
          </span>
        </label>

        {/* Error */}
        {error && (
          <p className="mb-4 text-sm text-red-400 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            data-testid="terms-accept-btn"
            type="button"
            disabled={!checked || loading}
            onClick={handleAccept}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : 'Accept & Continue'}
          </button>
          <button
            data-testid="terms-dismiss-btn"
            type="button"
            onClick={onDismiss}
            disabled={loading}
            className="rounded-xl border border-[#1e2d4a] px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
        </div>

        {/* Blocked message shown after dismiss */}
        <p className="mt-3 text-center text-[11px] text-slate-600 leading-snug">
          Please accept the Terms to post or respond.
        </p>
      </div>
    </div>
  )
}
