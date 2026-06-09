'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type RangeKey = 'month' | '30d' | '3mo' | '12mo' | 'custom'

const QUICK_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '30d',   label: 'Last 30 days' },
  { key: '3mo',   label: 'Last 3 months' },
  { key: '12mo',  label: 'Last 12 months' },
]

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function minDateStr(): string {
  return new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function monthStartStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface Props {
  range: string
  from: string | null
  to: string | null
  view: string | null
}

export default function RangeFilter({ range, from, to, view }: Props) {
  const router = useRouter()
  const today = todayStr()
  const minDate = minDateStr()

  const [customFrom, setCustomFrom] = useState(from ?? monthStartStr())
  const [customTo, setCustomTo] = useState(to ?? today)
  const [rangeError, setRangeError] = useState<string | null>(null)

  function buildUrl(params: Record<string, string | null | undefined>): string {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v)
    }
    return `/dashboard/activity?${qs.toString()}`
  }

  function handleQuickFilter(key: string) {
    setRangeError(null)
    router.push(buildUrl({ range: key, view }))
  }

  function handleApply() {
    setRangeError(null)
    if (!customFrom || !customTo) {
      setRangeError('Select both a start and end date.')
      return
    }
    if (customFrom > customTo) {
      setRangeError('Start date must be on or before the end date.')
      return
    }
    if (customFrom < minDate) {
      setRangeError('Start date cannot be more than 12 months ago.')
      return
    }
    if (customTo > today) {
      setRangeError('End date cannot be in the future.')
      return
    }
    router.push(buildUrl({ range: 'custom', from: customFrom, to: customTo, view }))
  }

  const isCustomActive = range === 'custom'

  return (
    <div data-testid="activity-range-filter" className="mb-8 space-y-3">
      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        {QUICK_OPTIONS.map(opt => (
          <button
            key={opt.key}
            data-testid={`range-${opt.key}`}
            onClick={() => handleQuickFilter(opt.key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
              range === opt.key
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 shrink-0">Custom range:</span>
        <input
          data-testid="range-from-input"
          type="date"
          value={customFrom}
          min={minDate}
          max={customTo || today}
          onChange={e => { setCustomFrom(e.target.value); setRangeError(null) }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-400"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          data-testid="range-to-input"
          type="date"
          value={customTo}
          min={customFrom || minDate}
          max={today}
          onChange={e => { setCustomTo(e.target.value); setRangeError(null) }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-400"
        />
        <button
          data-testid="range-custom-apply"
          onClick={handleApply}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            isCustomActive
              ? 'border-blue-500 bg-blue-500 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-600'
          }`}
        >
          {isCustomActive ? 'Applied ✓' : 'Apply'}
        </button>
      </div>

      {rangeError && (
        <p data-testid="range-error" className="text-xs text-red-500">{rangeError}</p>
      )}
    </div>
  )
}
