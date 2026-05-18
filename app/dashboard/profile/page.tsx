'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  id: string
  name: string | null
  university: string | null
  major: string | null
  year: string | null
  rating: number
  completed_tasks: number
  verification_status: string
  created_at: string
}

interface Review {
  id: string
  rating: number
  review_text: string | null
  created_at: string
  reviewer_name: string | null
}

const YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other']

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [requestCount, setRequestCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState('')
  const [university, setUniversity] = useState('')
  const [major, setMajor] = useState('')
  const [year, setYear] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileResult, countResult, reviewsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, university, major, year, rating, completed_tasks, verification_status, created_at')
        .eq('id', user.id)
        .single(),
      supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('requester_id', user.id),
      supabase
        .from('reviews')
        .select('id, rating, review_text, created_at, reviewer_id')
        .eq('reviewed_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    if (profileResult.data) {
      const p = profileResult.data as Profile
      setProfile(p)
      setName(p.name ?? '')
      setUniversity(p.university ?? '')
      setMajor(p.major ?? '')
      setYear(p.year ?? '')
    }

    setRequestCount(countResult.count ?? 0)

    if (reviewsResult.data && reviewsResult.data.length > 0) {
      const reviewerIds = reviewsResult.data.map((r: { reviewer_id: string }) => r.reviewer_id)
      const { data: reviewerProfiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', reviewerIds)
      const profileMap = new Map((reviewerProfiles ?? []).map((p: { id: string; name: string | null }) => [p.id, p.name]))

      setReviews(reviewsResult.data.map((r: { id: string; rating: number; review_text: string | null; created_at: string; reviewer_id: string }) => ({
        id: r.id,
        rating: r.rating,
        review_text: r.review_text,
        created_at: r.created_at,
        reviewer_name: profileMap.get(r.reviewer_id) ?? null,
      })))
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || saving) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({
      name: name.trim() || null,
      university: university.trim() || null,
      major: major.trim() || null,
      year: year || null,
    }).eq('id', profile.id)

    if (error) {
      setSaveError(error.message)
    } else {
      setProfile(prev => prev
        ? { ...prev, name: name.trim() || null, university: university.trim() || null, major: major.trim() || null, year: year || null }
        : prev
      )
      setSaveSuccess(true)
      setEditMode(false)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Spinner /> Loading profile…
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-slate-500">Could not load profile.</p>
      </div>
    )
  }

  const initials = profile.name
    ? profile.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'
  const isVerified = profile.verification_status === 'verified'
  const avgRating = Number(profile.rating).toFixed(1)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 pb-12 space-y-8">
      {/* Profile header */}
      <div className="flex items-start gap-5">
        <div className="relative flex-shrink-0">
          <div className="h-20 w-20 flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-2xl font-bold text-white shadow-lg shadow-blue-500/20">
            {initials}
          </div>
          {isVerified && (
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 border-2 border-[#0a0f1e]" title="Verified student">
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-white">{profile.name ?? 'Your Profile'}</h1>
            {isVerified && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                ✓ Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {[profile.year, profile.major, profile.university].filter(Boolean).join(' · ') || 'No details added yet'}
          </p>
          <p className="mt-1 text-xs text-slate-600">Member since {memberSince(profile.created_at)}</p>
        </div>

        <button
          type="button"
          onClick={() => { setEditMode(e => !e); setSaveError(null) }}
          className="flex-shrink-0 rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-blue-500/30 hover:text-blue-400"
        >
          {editMode ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Requests" value={String(requestCount)} />
        <StatCard label="Completed" value={String(profile.completed_tasks)} />
        <StatCard label="Rating" value={avgRating} sub="/ 5.0" />
        <StatCard label="Reviews" value={String(reviews.length)} />
      </div>

      {saveSuccess && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-400">
          Profile saved successfully.
        </div>
      )}

      {/* Edit form */}
      {editMode && (
        <div className="rounded-2xl border border-blue-500/20 bg-[#0d1526] p-6">
          <h2 className="text-sm font-semibold text-white mb-5">Edit Profile</h2>

          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Full Name">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alex Johnson"
                disabled={saving}
                className={inputCls}
              />
            </Field>

            <Field label="University">
              <input
                type="text"
                value={university}
                onChange={e => setUniversity(e.target.value)}
                placeholder="e.g. University of Texas at Dallas"
                disabled={saving}
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Major">
                <input
                  type="text"
                  value={major}
                  onChange={e => setMajor(e.target.value)}
                  placeholder="e.g. Computer Science"
                  disabled={saving}
                  className={inputCls}
                />
              </Field>
              <Field label="Year">
                <select
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  disabled={saving}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="" className="bg-[#0d1526]">Select year</option>
                  {YEAR_OPTIONS.map(y => (
                    <option key={y} value={y} className="bg-[#0d1526]">{y}</option>
                  ))}
                </select>
              </Field>
            </div>

            {saveError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-xs text-red-400">
                {saveError}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      )}

      {/* Reviews */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-4">
          Reviews received
          {reviews.length > 0 && (
            <span className="ml-2 rounded-full border border-[#1e2d4a] px-2.5 py-0.5 text-xs font-semibold text-slate-500">
              {reviews.length}
            </span>
          )}
        </h2>

        {reviews.length === 0 ? (
          <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526]/60 px-4 py-10 text-center">
            <div className="mb-2 text-2xl">⭐</div>
            <p className="text-sm font-medium text-slate-400">No reviews yet</p>
            <p className="mt-1 text-xs text-slate-600">Complete tasks to earn your first review</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reviews.map(review => (
              <div key={review.id} className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-700/30 text-[11px] font-semibold text-blue-300">
                      {review.reviewer_name ? review.reviewer_name[0].toUpperCase() : '?'}
                    </div>
                    <span className="text-xs font-medium text-slate-200">{review.reviewer_name ?? 'Anonymous'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StarRating rating={review.rating} />
                    <span className="text-xs text-slate-600">{timeAgo(review.created_at)}</span>
                  </div>
                </div>
                {review.review_text && (
                  <p className="text-sm text-slate-400 leading-relaxed pl-9">{review.review_text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-3 py-4">
      <div className="flex items-baseline gap-1">
        <p className="text-xl font-bold text-white">{value}</p>
        {sub && <span className="text-xs text-slate-600">{sub}</span>}
      </div>
      <p className="mt-1 text-[11px] text-slate-500 leading-tight">{label}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} className={`h-3 w-3 ${n <= rating ? 'text-yellow-400' : 'text-slate-700'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

const inputCls =
  'w-full rounded-lg border border-[#1e2d4a] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50'
