'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'PhD'] as const

const SPECIAL_CHAR_RE = /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/

function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.'
  if (!SPECIAL_CHAR_RE.test(password)) return 'Password must contain at least one special character.'
  return null
}

const EDU_BYPASSES = new Set(['anandmsundaram@gmail.com', 'campusosapp@gmail.com', 'valsgum@gmail.com'])

function isEduEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  return EDU_BYPASSES.has(normalized) || normalized.endsWith('.edu')
}

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    university: '',
    major: '',
    year: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)

  const eduError = emailTouched && form.email.length > 0 && !isEduEmail(form.email)
  const pwdHasLength = form.password.length >= 10
  const pwdHasSpecial = SPECIAL_CHAR_RE.test(form.password)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isEduEmail(form.email)) {
      setError('Only .edu email addresses are allowed.')
      return
    }

    const pwdError = validatePassword(form.password)
    if (pwdError) {
      setError(pwdError)
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.name,
          university: form.university,
          major: form.major,
          year: form.year,
        },
        emailRedirectTo: `${location.origin}/api/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/login?message=Check your email to confirm your account')
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:border-blue-500/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-blue-500/10'

  const labelClass = 'text-xs font-medium text-slate-400 uppercase tracking-wider'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1f] px-4 py-12">
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
          <p className="mt-2 text-sm text-slate-400">
            Create your campus account
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className={labelClass}>Full Name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={form.name}
                onChange={set('name')}
                placeholder="Alex Johnson"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className={labelClass}>
                University Email
                <span className="ml-1.5 text-blue-400/70 normal-case font-normal tracking-normal">.edu required</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={set('email')}
                onBlur={() => setEmailTouched(true)}
                placeholder="you@university.edu"
                className={[
                  inputClass,
                  eduError ? 'border-red-500/50 focus:border-red-500/60 focus:ring-red-500/10' : '',
                ].join(' ')}
              />
              {eduError && (
                <p className="text-xs text-red-400">Must be a .edu email address</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className={labelClass}>Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={form.password}
                onChange={set('password')}
                placeholder="Min. 10 characters + special char"
                className={inputClass}
              />
              {form.password.length > 0 && (
                <ul className="mt-0.5 space-y-0.5 pl-0.5">
                  {[
                    { met: pwdHasLength, text: 'At least 10 characters' },
                    { met: pwdHasSpecial, text: 'At least one special character (!@#$…)' },
                  ].map(({ met, text }) => (
                    <li key={text} className={`flex items-center gap-1.5 text-[11px] transition-colors ${met ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span>{met ? '✓' : '○'}</span>{text}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="university" className={labelClass}>University</label>
              <input
                id="university"
                type="text"
                required
                value={form.university}
                onChange={set('university')}
                placeholder="MIT, Stanford, UCLA…"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="major" className={labelClass}>Major</label>
                <input
                  id="major"
                  type="text"
                  required
                  value={form.major}
                  onChange={set('major')}
                  placeholder="CS, Biology…"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="year" className={labelClass}>Year</label>
                <select
                  id="year"
                  required
                  value={form.year}
                  onChange={set('year')}
                  className={[inputClass, 'cursor-pointer appearance-none'].join(' ')}
                >
                  <option value="" disabled className="bg-[#0d1a2d]">Select…</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y} className="bg-[#0d1a2d]">{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
