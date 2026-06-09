'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics'

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'PhD'] as const

const SPECIAL_CHAR_RE = /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/

function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.'
  if (!SPECIAL_CHAR_RE.test(password)) return 'Password must contain at least one special character.'
  return null
}

function isEduEmail(email: string) {
  return email.trim().toLowerCase().endsWith('.edu')
}

async function isAllowedEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (normalized.endsWith('.edu')) return true
  const supabase = createClient()
  const { data } = await supabase.rpc('is_email_whitelisted', { p_email: normalized })
  return !!data
}

type CampusCheckResult =
  | { ok: true }
  | { ok: false; reason: 'waitlist'; message: string }
  | { ok: false; reason: 'disabled'; message: string }
  | { ok: false; reason: 'unsupported'; message: string }

async function checkCampusStatus(email: string): Promise<CampusCheckResult> {
  const normalized = email.trim().toLowerCase()
  if (!normalized.endsWith('.edu')) return { ok: true }

  const domain = normalized.split('@')[1] ?? ''
  const supabase = createClient()
  const { data } = await supabase.rpc('get_campus_for_domain', { p_domain: domain })
  const row = Array.isArray(data) ? data[0] : data

  if (!row) {
    return {
      ok: false,
      reason: 'unsupported',
      message: "CampusOS isn't available at your school yet. We're expanding to more campuses soon — check back or contact us at campusosapp@gmail.com.",
    }
  }

  if (row.campus_status === 'waitlist') {
    return {
      ok: false,
      reason: 'waitlist',
      message: "CampusOS isn't live at your campus yet. We're launching Texas campuses in phases — your school is on our list. Check back soon!",
    }
  }

  if (row.campus_status === 'disabled') {
    return {
      ok: false,
      reason: 'disabled',
      message: 'CampusOS is not currently available at your campus. Contact campusosapp@gmail.com for more info.',
    }
  }

  return { ok: true }
}

export interface CampusOption {
  id: string
  name: string
  slug: string
  status: string
  domain_hint: string | null
}

interface Props {
  campuses: CampusOption[]
}

export default function SignupForm({ campuses }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    campusSlug: '',
    major: '',
    year: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [showSignInLink, setShowSignInLink] = useState(false)
  const [loading, setLoading] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const signupStartedFired = useRef(false)

  const emailLower = form.email.trim().toLowerCase()
  const emailDomain = emailLower.split('@')[1] ?? ''
  const eduError = emailTouched && form.email.length > 0 && !isEduEmail(form.email)
  const pwdHasLength = form.password.length >= 10
  const pwdHasSpecial = SPECIAL_CHAR_RE.test(form.password)

  // Client-side campus/email domain mismatch hint
  const selectedCampus = campuses.find(c => c.slug === form.campusSlug) ?? null
  const campusMismatch =
    emailTouched &&
    form.campusSlug !== '' &&
    selectedCampus?.domain_hint != null &&
    isEduEmail(form.email) &&
    emailDomain !== selectedCampus.domain_hint

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setShowSignInLink(false)
    setLoading(true)

    if (!(await isAllowedEmail(form.email))) {
      setError('Use a .edu email, or ask us to pre-approve this email.')
      setLoading(false)
      return
    }

    const campusCheck = await checkCampusStatus(form.email)
    if (!campusCheck.ok) {
      setError(campusCheck.message)
      setLoading(false)
      return
    }

    const supabase = createClient()
    const normalizedEmail = form.email.trim().toLowerCase()
    const { data: isRegistered } = await supabase.rpc('is_email_registered', { p_email: normalizedEmail })
    if (isRegistered) {
      const { data: isSuspended } = await supabase.rpc('is_user_suspended', { p_email: normalizedEmail })
      if (isSuspended) {
        setError('This account has been suspended. Contact campusosapp@gmail.com for help.')
      } else {
        setError('An account already exists for this email.')
        setShowSignInLink(true)
      }
      setLoading(false)
      return
    }

    const pwdError = validatePassword(form.password)
    if (pwdError) {
      setError(pwdError)
      setLoading(false)
      return
    }

    const universityName = selectedCampus?.name ?? form.campusSlug

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.name,
          university: universityName,
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

    trackEvent('signup_completed')
    router.push('/login?message=Check your email to confirm your account')
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

  const labelClass = 'text-xs font-semibold text-slate-600 uppercase tracking-wider'

  const activeCampuses = campuses.filter(c => c.status === 'active_beta')
  const waitlistCampuses = campuses.filter(c => c.status === 'waitlist')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50/70 via-slate-50 to-white px-4 py-12">
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 hover:opacity-80 transition-opacity">
            <span className="text-blue-600">⬡</span> CampusOS
          </Link>
          <p className="mt-2 text-sm text-slate-500">
            Join your campus — get help or earn by helping
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md shadow-slate-200/60">
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
                <span className="ml-1.5 text-blue-500/80 normal-case font-normal tracking-normal">.edu required</span>
              </label>
              <input
                id="email"
                data-testid="email-input"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={set('email')}
                onFocus={() => {
                  if (!signupStartedFired.current) {
                    signupStartedFired.current = true
                    trackEvent('signup_started')
                  }
                }}
                onBlur={() => setEmailTouched(true)}
                placeholder="you@university.edu"
                className={[
                  inputClass,
                  eduError ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : '',
                ].join(' ')}
              />
              {eduError && (
                <p data-testid="email-inline-error" className="text-xs text-red-500">Must be a .edu address or pre-approved email</p>
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
                    <li key={text} className={`flex items-center gap-1.5 text-[11px] transition-colors ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <span>{met ? '✓' : '○'}</span>{text}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="university" className={labelClass}>University</label>
              <select
                id="university"
                data-testid="university-select"
                required
                value={form.campusSlug}
                onChange={set('campusSlug')}
                className={[inputClass, 'cursor-pointer appearance-none'].join(' ')}
              >
                <option value="" disabled>Select your Texas university</option>
                {activeCampuses.length > 0 && (
                  <optgroup label="Available now">
                    {activeCampuses.map(c => (
                      <option key={c.slug} value={c.slug}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
                {waitlistCampuses.length > 0 && (
                  <optgroup label="Coming soon">
                    {waitlistCampuses.map(c => (
                      <option key={c.slug} value={c.slug} disabled>
                        {c.name} — Coming soon
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {campusMismatch && selectedCampus && (
                <p data-testid="campus-mismatch-error" className="text-xs text-amber-600">
                  Your email domain doesn&apos;t match {selectedCampus.name}. Expected: @{selectedCampus.domain_hint}
                </p>
              )}
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
                  <option value="" disabled>Select…</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div data-testid="signup-error" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">
                {error}
                {showSignInLink && (
                  <> <Link href="/login" className="underline font-semibold">Sign in</Link></>
                )}
              </div>
            )}
            {error && (error.includes("isn't live") || error.includes("isn't available") || error.includes("not currently")) && (
              <p data-testid="campus-waitlist-msg" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                Questions? Email us at campusosapp@gmail.com
              </p>
            )}

            <button
              data-testid="signup-submit-btn"
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <p className="text-center text-[11px] text-slate-400 leading-relaxed">
              By creating an account you agree to our{' '}
              <a href="/terms" target="_blank" rel="noopener" className="text-slate-500 underline underline-offset-2 hover:text-slate-800 transition-colors">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noopener" className="text-slate-500 underline underline-offset-2 hover:text-slate-800 transition-colors">
                Privacy Policy
              </a>.
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:text-blue-500 transition-colors font-semibold">
            Sign in
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600 transition-colors">← Back to CampusOS</Link>
        </p>
      </div>
    </div>
  )
}
