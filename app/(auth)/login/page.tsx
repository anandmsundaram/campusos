'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(searchParams.get('error'))
  const [message] = useState<string | null>(searchParams.get('message'))
  const [loading, setLoading] = useState(false)
  const isInvalidCredentials = !!error && /invalid login credentials|invalid email or password/i.test(error)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50/70 via-slate-50 to-white px-4 py-12">
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 hover:opacity-80 transition-opacity">
            <span className="text-blue-600">⬡</span> CampusOS
          </Link>
          <p className="mt-2 text-sm text-slate-500">
            Welcome back — sign in to your campus
          </p>
        </div>

        {/* Success message (e.g. after signup) */}
        {message && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md shadow-slate-200/60">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-blue-600 hover:text-blue-500 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
                <p>{error}</p>
                {isInvalidCredentials && (
                  <p className="mt-1.5">
                    Forgot your password?{' '}
                    <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500 transition-colors underline">
                      Reset it here
                    </Link>
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-blue-600 hover:text-blue-500 transition-colors font-semibold">
            Create one free
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600 transition-colors">← Back to CampusOS</Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
