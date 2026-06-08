'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getMyBlocks, unblockUser, type BlockRecord } from '@/lib/blocking'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const UNBLOCK_REASONS = [
  { value: 'resolved',       label: 'Issue resolved' },
  { value: 'was_a_mistake',  label: 'Blocked by mistake' },
  { value: 'reconciled',     label: 'We worked it out' },
  { value: 'other',          label: 'Other' },
] as const

type UnblockReason = typeof UNBLOCK_REASONS[number]['value']

function UnblockModal({
  block,
  onClose,
  onUnblocked,
}: {
  block: BlockRecord
  onClose: () => void
  onUnblocked: (blockId: string) => void
}) {
  const [reason, setReason]         = useState<UnblockReason | ''>('')
  const [submitting, setSubmitting]  = useState(false)
  const [error, setError]            = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason || submitting) return
    setError(null)
    setSubmitting(true)
    const supabase = createClient()
    const result = await unblockUser(supabase, block.id, reason)
    if (!result.ok) {
      setError(result.error ?? 'Failed to unblock. Please try again.')
      setSubmitting(false)
      return
    }
    onUnblocked(block.id)
    onClose()
  }

  return (
    <div
      data-testid="unblock-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#1e2d4a] bg-[#0d1526] p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Unblock {block.blocked_name ?? 'user'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              They will be able to interact with your requests again.
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:text-slate-400">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400">
              Reason <span className="text-red-400">*</span>
            </label>
            <select
              required
              data-testid="unblock-reason-select"
              value={reason}
              onChange={(e) => setReason(e.target.value as UnblockReason)}
              disabled={submitting}
              className="w-full rounded-lg border border-[#1e2d4a] bg-[#060b17] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-50 cursor-pointer appearance-none"
            >
              <option value="" disabled className="bg-[#0d1526]">Select a reason…</option>
              {UNBLOCK_REASONS.map(r => (
                <option key={r.value} value={r.value} className="bg-[#0d1526]">{r.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              data-testid="unblock-submit-btn"
              disabled={!reason || submitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Unblocking…' : 'Confirm unblock'}
            </button>
            <button type="button" onClick={onClose} disabled={submitting}
              className="rounded-lg border border-[#1e2d4a] px-4 py-2.5 text-xs font-medium text-slate-400 hover:border-white/20 hover:text-white disabled:opacity-40">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function BlockedUsersPage() {
  const [blocks, setBlocks]           = useState<BlockRecord[]>([])
  const [loading, setLoading]         = useState(true)
  const [unblockTarget, setUnblockTarget] = useState<BlockRecord | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const data = await getMyBlocks(supabase)
    setBlocks(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleUnblocked(blockId: string) {
    setBlocks(prev => prev.filter(b => b.id !== blockId))
  }

  return (
    <div data-testid="blocked-users-page" className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Blocked Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Blocked users cannot offer on your requests or contact you.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading…
        </div>
      ) : blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1e2d4a] bg-[#0d1526] py-14 px-6 text-center">
          <p className="text-sm font-semibold text-slate-300">No blocked users</p>
          <p className="mt-1.5 text-xs text-slate-500">Users you block will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {blocks.map(block => (
            <div
              key={block.id}
              data-testid="blocked-user-row"
              data-block-id={block.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {block.blocked_name ?? 'Unknown user'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Blocked {timeAgo(block.created_at)} · {block.reason.replace(/_/g, ' ')}
                </p>
              </div>
              <button
                type="button"
                data-testid="unblock-btn"
                onClick={() => setUnblockTarget(block)}
                className="flex-shrink-0 rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-blue-500/30 hover:text-blue-400 transition-colors"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      {unblockTarget && (
        <UnblockModal
          block={unblockTarget}
          onClose={() => setUnblockTarget(null)}
          onUnblocked={handleUnblocked}
        />
      )}
    </div>
  )
}
