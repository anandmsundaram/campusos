'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-[11px] transition-colors ${met ? 'text-emerald-400' : 'text-slate-500'}`}>
      <span>{met ? '✓' : '○'}</span>
      {text}
    </li>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState<boolean | null>(null) // null = checking

  // Verify a recovery session exists before showing the form
  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      setSessionReady(!!session)
    })
  }, [])

  const hasMinLength = password.length >= 10
  const hasSpecial = /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(password)
  const passwordsMatch = password.length > 0 && password === confirm
  const isValid = hasMinLength && hasSpecial

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isValid) {
      setError('Password does not meet the requirements below.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 2500)
  }

  // Still checking session
  if (sessionReady === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1f]">
        <p className="text-xs text-slate-500">Verifying link…</p>
      </div>
    )
  }

  // Session missing — link expired or already used
  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1f] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center shadow-2xl shadow-black/40">
          <p className="text-sm font-medium text-white mb-1">Link expired or already used</p>
          <p className="text-xs text-slate-400 mb-5 leading-relaxed">
            Password reset links are single-use and expire after 1 hour.
          </p>
          <Link
            href="/forgot-password"
            className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1f] px-4">
        <div className="relative w-full max-w-sm text-center">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
            <div className="mb-3 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-xl">
                ✓
              </div>
            </div>
            <p className="text-sm font-medium text-white">Password updated</p>
            <p className="mt-1.5 text-xs text-slate-400">Redirecting you to the dashboard…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1f] px-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37,99,235,0.15), transparent)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-white">
            <span className="text-blue-400">⬡</span> CampusOS
          </span>
          <p className="mt-2 text-sm text-slate-400">Choose a new password</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                New Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 10 characters"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:border-blue-500/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-blue-500/10"
              />

              {password.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-0.5">
                  <PasswordRequirement met={hasMinLength} text="At least 10 characters" />
                  <PasswordRequirement met={hasSpecial} text="At least one special character (!@#$…)" />
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Confirm Password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                className={[
                  'w-full rounded-lg border bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:bg-white/[0.06] focus:ring-2',
                  confirm.length > 0 && !passwordsMatch
                    ? 'border-red-500/50 focus:border-red-500/60 focus:ring-red-500/10'
                    : 'border-white/10 focus:border-blue-500/60 focus:ring-blue-500/10',
                ].join(' ')}
              />
              {confirm.length > 0 && !passwordsMatch && (
                <p className="text-[11px] text-red-400">Passwords do not match</p>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !isValid || !passwordsMatch}
              className="mt-1 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Link expired?{' '}
          <Link href="/forgot-password" className="text-blue-400 hover:text-blue-300 transition-colors">
            Request a new one
          </Link>
        </p>
      </div>
    </div>
  )
}
