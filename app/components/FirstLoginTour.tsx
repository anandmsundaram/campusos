'use client'

import { useState } from 'react'
import { TOUR_STEPS } from '@/lib/tour'

interface Props {
  onCompleted: () => void
  onSkipped: (step: number) => void
}

export default function FirstLoginTour({ onCompleted, onSkipped }: Props) {
  const [step, setStep] = useState(0)
  const total = TOUR_STEPS.length
  const current = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === total - 1

  return (
    <div
      data-testid="first-login-tour"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#1e2d4a] bg-[#0d1526] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress */}
        <div className="flex items-center justify-between mb-5">
          <span
            data-testid="tour-progress"
            className="text-xs font-medium text-slate-500"
          >
            {step + 1} of {total}
          </span>
          <div className="flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i <= step ? 'w-5 bg-blue-500' : 'w-3 bg-[#1e2d4a]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step title */}
        <h2
          data-testid="tour-step-title"
          className="text-base font-bold text-white mb-2 leading-snug"
        >
          {current.title}
        </h2>

        {/* Step body */}
        <p
          data-testid="tour-step-body"
          className="text-sm text-slate-300 leading-relaxed mb-4"
        >
          {current.body}
        </p>

        {/* Examples */}
        {current.examples && (
          <ul className="mb-4 flex flex-col gap-1">
            {current.examples.map((ex, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="mt-0.5 text-slate-600 flex-shrink-0">•</span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Note */}
        {current.note && (
          <p className="mb-4 text-xs text-slate-500 leading-relaxed border-l-2 border-[#1e2d4a] pl-3 italic">
            {current.note}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-6 flex-wrap">
          {!isFirst && (
            <button
              data-testid="tour-back"
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="rounded-xl border border-[#1e2d4a] px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white"
            >
              Back
            </button>
          )}

          <div className="flex-1" />

          <button
            data-testid="tour-skip"
            type="button"
            onClick={() => onSkipped(step + 1)}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors px-2 py-1"
          >
            Skip tour
          </button>

          {isLast ? (
            <button
              data-testid="tour-finish"
              type="button"
              onClick={onCompleted}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500"
            >
              Start using CampusOS
            </button>
          ) : (
            <button
              data-testid="tour-next"
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
