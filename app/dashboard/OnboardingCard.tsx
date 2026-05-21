'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'campusos_onboarding_dismissed'

const CATEGORIES = [
  { emoji: '🚗', label: 'Rides', prompt: 'I need a ride from Austin to Dallas this Friday, leaving at 8 AM — $20 budget' },
  { emoji: '📦', label: 'Moving', prompt: 'Need 2 people to help me move dorms this Saturday morning, happy to pay $30 each' },
  { emoji: '📚', label: 'Tutoring', prompt: 'Looking for a stats tutor for my ECON 301 midterm prep this week' },
  { emoji: '🛒', label: 'Errands', prompt: 'Can someone pick up my Amazon package from the front desk? I\'m in the library until 6 PM' },
  { emoji: '🔌', label: 'Borrowing', prompt: 'Need to borrow a graphing calculator for finals week' },
]

export default function OnboardingCard() {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true)
      }
    } catch {
      // localStorage unavailable — don't show card
    }
  }, [])

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* */ }
    setVisible(false)
  }

  function usePrompt(prompt: string) {
    // Copy to clipboard so the user can paste it into RequestInput
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(prompt)
      setTimeout(() => setCopied(null), 2000)
    }).catch(() => { /* clipboard denied */ })
  }

  if (!visible) return null

  return (
    <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-semibold text-white">Welcome to CampusOS</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            Post anything campus-related — rides, moving help, tutoring, errands, or borrowing items.
            Other verified students will respond with offers.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:text-slate-400 transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2.5">
        Try an example — click to copy
      </p>

      <div className="flex flex-col gap-1.5">
        {CATEGORIES.map(c => (
          <button
            key={c.label}
            type="button"
            onClick={() => usePrompt(c.prompt)}
            className="group flex items-start gap-3 rounded-xl border border-[#1e2d4a] bg-[#060b17]/60 px-3.5 py-2.5 text-left transition-all hover:border-blue-500/30 hover:bg-blue-500/[0.04]"
          >
            <span className="text-base leading-none mt-0.5 flex-shrink-0">{c.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 mb-0.5">{c.label}</p>
              <p className="text-xs text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors truncate">
                {c.prompt}
              </p>
            </div>
            <span className={`flex-shrink-0 mt-0.5 text-[10px] font-medium transition-colors ${copied === c.prompt ? 'text-emerald-400' : 'text-slate-700 group-hover:text-blue-400'}`}>
              {copied === c.prompt ? 'Copied!' : 'Copy'}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3.5 text-[10px] text-slate-700 text-center">
        Paste the prompt into the input above, then hit Enter.
        <button type="button" onClick={dismiss} className="ml-2 text-slate-600 underline underline-offset-2 hover:text-slate-400 transition-colors">
          Dismiss
        </button>
      </p>
    </div>
  )
}
