'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type RequestStatus = 'open' | 'matched' | 'completed' | 'cancelled'

interface HelperProfile {
  name: string | null
  rating: number | null
}

interface OfferOnRequest {
  id: string
  helper_id: string
  status: 'pending' | 'accepted' | 'rejected'
  counter_budget: number | null
  message: string | null
  profiles: HelperProfile | HelperProfile[] | null
}

interface MyRequest {
  id: string
  title: string
  category: string
  urgency: string
  status: RequestStatus
  location: string | null
  budget: number | null
  scheduled_time: string | null
  created_at: string
  request_offers: OfferOnRequest[]
}

const CATEGORY_LABELS: Record<string, string> = {
  rides: 'Rides', moving: 'Moving Help', peer_help: 'Peer Help', errands: 'Errands', borrow: 'Borrow',
}
const CATEGORY_ACCENT: Record<string, string> = {
  rides: 'bg-blue-500', moving: 'bg-orange-500', peer_help: 'bg-green-500', errands: 'bg-purple-500', borrow: 'bg-pink-500',
}
const CATEGORY_BADGE: Record<string, string> = {
  rides: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  moving: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  peer_help: 'text-green-400 bg-green-500/10 border-green-500/20',
  errands: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  borrow: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
}
const URGENCY_BADGE: Record<string, string> = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
}
const STATUS_SECTIONS: Array<{ status: RequestStatus; label: string; badgeClass: string }> = [
  { status: 'open',      label: 'Open',      badgeClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { status: 'matched',   label: 'Matched',   badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { status: 'completed', label: 'Completed', badgeClass: 'text-slate-400 bg-white/[0.03] border-white/10' },
  { status: 'cancelled', label: 'Cancelled', badgeClass: 'text-slate-600 bg-white/[0.02] border-[#1e2d4a]' },
]

function normalizeProfile(p: HelperProfile | HelperProfile[] | null | undefined): HelperProfile | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('requests')
      .select(`
        id, title, category, urgency, status, location, budget, scheduled_time, created_at,
        request_offers(id, helper_id, status, counter_budget, message, profiles(name, rating))
      `)
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })

    setRequests((data as MyRequest[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCancel(requestId: string) {
    setActing(requestId)
    setActionError(null)
    const supabase = createClient()
    const { error } = await supabase.from('requests').update({ status: 'cancelled' }).eq('id', requestId)
    if (error) { setActionError(error.message) } else {
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'cancelled' } : r))
    }
    setActing(null)
  }

  async function handleComplete(requestId: string) {
    setActing(requestId)
    setActionError(null)
    const supabase = createClient()
    const { error } = await supabase.from('requests').update({ status: 'completed' }).eq('id', requestId)
    if (error) { setActionError(error.message) } else {
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'completed' } : r))
    }
    setActing(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Spinner /> Loading your requests…
        </div>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-12">
        <PageHeader title="My Requests" sub="Requests you've posted on CampusOS" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1e2d4a] bg-[#0d1526] py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#1e2d4a] bg-[#0a0f1e] text-2xl">
            📝
          </div>
          <p className="text-sm font-medium text-slate-400">You haven't posted any requests yet</p>
          <p className="mt-1 text-xs text-slate-600">Head to the dashboard to post your first request</p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const grouped = STATUS_SECTIONS.map(s => ({
    ...s,
    items: requests.filter(r => r.status === s.status),
  })).filter(s => s.items.length > 0)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-12 space-y-10">
      <PageHeader title="My Requests" sub={`${requests.length} total request${requests.length !== 1 ? 's' : ''}`} />

      {actionError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-400">
          {actionError}
        </div>
      )}

      {grouped.map(({ status, label, badgeClass, items }) => (
        <section key={status}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-slate-300">{label}</h2>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
              {items.length}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {items.map(req => {
              const acceptedOffer = req.request_offers.find(o => o.status === 'accepted')
              const acceptedHelper = acceptedOffer ? normalizeProfile(acceptedOffer.profiles) : null
              const pendingCount = req.request_offers.filter(o => o.status === 'pending').length
              const isActing = acting === req.id
              const dimmed = req.status === 'cancelled' || req.status === 'completed'

              return (
                <div
                  key={req.id}
                  className={`relative overflow-hidden rounded-xl border border-[#1e2d4a] bg-[#0d1526] transition-opacity ${dimmed ? 'opacity-60' : ''}`}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${CATEGORY_ACCENT[req.category] ?? 'bg-slate-500'}`} />

                  <div className="pl-5 pr-4 pt-4 pb-4">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CATEGORY_BADGE[req.category]}`}>
                        {CATEGORY_LABELS[req.category] ?? req.category}
                      </span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${URGENCY_BADGE[req.urgency]}`}>
                        {req.urgency}
                      </span>
                    </div>

                    <p className="text-[15px] font-semibold text-white leading-snug mb-3">{req.title}</p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                      {req.location && <span>📍 {req.location}</span>}
                      {req.scheduled_time && (
                        <span>🕐 {new Date(req.scheduled_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      )}
                      {req.budget != null && <span>💵 ${req.budget}</span>}
                      <span className="text-slate-600">{timeAgo(req.created_at)}</span>
                    </div>

                    {req.status === 'matched' && acceptedHelper && (
                      <div className="mb-3 flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5">
                        <div className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-700/30 text-xs font-semibold text-emerald-300">
                          {acceptedHelper.name ? acceptedHelper.name[0].toUpperCase() : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-emerald-300">{acceptedHelper.name ?? 'Anonymous'}</span>
                          {acceptedHelper.rating != null && (
                            <span className="ml-2 text-xs text-emerald-600">★ {Number(acceptedHelper.rating).toFixed(1)}</span>
                          )}
                        </div>
                        {acceptedOffer?.counter_budget != null && (
                          <span className="text-xs font-semibold text-yellow-400">${acceptedOffer.counter_budget} agreed</span>
                        )}
                        <span className="text-[10px] font-medium text-emerald-500">Helper matched</span>
                      </div>
                    )}

                    {req.status === 'open' && pendingCount > 0 && (
                      <p className="mb-3 text-xs text-slate-500">
                        {pendingCount} pending offer{pendingCount !== 1 ? 's' : ''}
                      </p>
                    )}

                    <div className="flex items-center gap-2 border-t border-[#1e2d4a] pt-3">
                      {req.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => handleCancel(req.id)}
                          disabled={isActing}
                          className="rounded-lg border border-[#1e2d4a] px-3 py-1.5 text-xs font-medium text-slate-500 transition-all hover:border-red-500/30 hover:text-red-400 disabled:opacity-40"
                        >
                          {isActing ? '…' : 'Cancel request'}
                        </button>
                      )}
                      {req.status === 'matched' && (
                        <button
                          type="button"
                          onClick={() => handleComplete(req.id)}
                          disabled={isActing}
                          className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                        >
                          {isActing ? '…' : 'Mark complete'}
                        </button>
                      )}
                      {(req.status === 'completed' || req.status === 'cancelled') && (
                        <span className="text-xs capitalize text-slate-600">{req.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
    </div>
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
