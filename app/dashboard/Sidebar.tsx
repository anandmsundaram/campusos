'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics'

// Profile is excluded here and rendered explicitly so mobile can treat it as a sheet trigger
const NAV_MAIN = [
  { href: '/dashboard',          label: 'Dashboard',   icon: 'home' },
  { href: '/dashboard/rides',    label: 'Rides',        icon: 'rides' },
  { href: '/dashboard/requests', label: 'My Requests',  icon: 'list' },
  { href: '/dashboard/offers',   label: 'My Offers',    icon: 'offers' },
  { href: '/dashboard/messages', label: 'Messages',     icon: 'chat' },
]

const NOTIF_ICONS: Record<string, string> = {
  offer_received: '🤝',
  offer_accepted: '✅',
  offer_rejected: '❌',
  counter_offer:  '↩',
  new_message:    '💬',
  task_completed: '🎉',
}

// Destination and action label for each notification type
const NOTIF_ACTION: Record<string, { route: string; label: string }> = {
  offer_received: { route: '/dashboard/requests', label: 'View requests' },
  offer_accepted: { route: '/dashboard/offers',   label: 'View offer' },
  offer_rejected: { route: '/dashboard/offers',   label: 'View offer' },
  counter_offer:  { route: '/dashboard/offers',   label: 'Respond to counter' },
  new_message:    { route: '/dashboard/messages', label: 'Open messages' },
  task_completed: { route: '/dashboard/requests', label: 'View requests' },
}

interface NotifRow {
  id: string
  type: string
  message: string
  read: boolean
  created_at: string
  related_request_id: string | null
}

interface Props {
  userName: string | null
  userEmail: string
  userId: string
  isAdmin: boolean
  logout: () => Promise<void>
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

// ─── Shared notification list (used in both desktop dropdown and mobile sheet) ─

function NotifList({
  notifications,
  loading,
  onClose,
}: {
  notifications: NotifRow[]
  loading: boolean
  onClose: () => void
}) {
  const router = useRouter()

  function navigate(n: NotifRow) {
    onClose()
    router.push(NOTIF_ACTION[n.type]?.route ?? '/dashboard')
  }

  if (loading) {
    return <div className="py-8 text-center text-xs text-slate-500">Loading…</div>
  }

  if (notifications.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-400 mb-1.5">All caught up</p>
        <p className="text-xs text-slate-600 leading-relaxed">
          Offer acceptances, counter-offers, messages, and ride updates will appear here.
        </p>
      </div>
    )
  }

  return (
    <>
      {notifications.map(n => {
        const action = NOTIF_ACTION[n.type]
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => navigate(n)}
            className={`w-full text-left border-b border-[#1e2d4a]/50 px-4 py-3 last:border-0 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] ${!n.read ? 'bg-blue-500/[0.04]' : ''}`}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex-shrink-0 text-base leading-none">
                {NOTIF_ICONS[n.type] ?? '🔔'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed text-slate-300">{n.message}</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <p className="text-[10px] text-slate-600">{timeAgo(n.created_at)}</p>
                  {action && (
                    <span className="text-[10px] text-blue-400/70">{action.label} →</span>
                  )}
                </div>
              </div>
              {!n.read && (
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
              )}
            </div>
          </button>
        )
      })}
    </>
  )
}

// ─── Desktop notification bell + dropdown ─────────────────────────────────────
// Receives unreadCount from Sidebar (shared with mobile bell) so both surfaces
// show the same count from a single realtime subscription.

function NotificationBell({
  userId,
  unreadCount,
  onRead,
}: {
  userId: string
  unreadCount: number
  onRead: () => void
}) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function handleToggle() {
    const opening = !open
    setOpen(opening)
    if (!opening) return

    trackEvent('notifications_opened')
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('id, type, message, read, created_at, related_request_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications((data ?? []) as NotifRow[])
    setLoading(false)

    if (unreadCount > 0) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
      onRead()
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // absolute left-0 top-full — positions below the bell container, left-aligned.
        // The sidebar is w-60 (240px) and the dropdown is w-80 (320px), so it extends
        // 80px into the content area over the sidebar's right edge. z-50 keeps it on top.
        <div className="absolute left-0 top-full mt-2 z-50 w-80 rounded-xl border border-[#1e2d4a] bg-[#060b17] shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-[#1e2d4a] px-4 py-3">
            <span className="text-xs font-semibold text-white">Notifications</span>
            {notifications.length > 0 && (
              <span className="text-[10px] text-slate-600">{notifications.length} recent</span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            <NotifList
              notifications={notifications}
              loading={loading}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ userName, userEmail, userId, isAdmin, logout }: Props) {
  const pathname = usePathname()
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false)
  const [mobileNotifications, setMobileNotifications] = useState<NotifRow[]>([])
  const [mobileNotifLoading, setMobileNotifLoading] = useState(false)

  // Single unread count — shared between desktop bell and mobile bell
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()

    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(({ count }) => setUnreadCount(count ?? 0))

    const channel = supabase
      .channel(`notif-sidebar-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => setUnreadCount(prev => prev + 1),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function openMobileNotif() {
    setMobileNotifOpen(true)
    trackEvent('notifications_opened')
    setMobileNotifLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('id, type, message, read, created_at, related_request_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    setMobileNotifications((data ?? []) as NotifRow[])
    setMobileNotifLoading(false)

    if (unreadCount > 0) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
      setUnreadCount(0)
      setMobileNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }

  const initials = userName
    ? userName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : (userEmail[0]?.toUpperCase() ?? '?')

  function isActive(href: string) {
    return pathname === href
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside data-testid="sidebar-nav" className="hidden md:flex fixed left-0 top-0 h-screen w-60 flex-col bg-[#060b17] border-r border-[#1e2d4a] z-30">
        {/* Logo + notification bell */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-[#1e2d4a] flex-shrink-0">
          <span className="text-blue-400 text-xl leading-none">⬡</span>
          <span className="flex-1 font-semibold text-[15px] tracking-tight text-white">CampusOS</span>
          <NotificationBell
            userId={userId}
            unreadCount={unreadCount}
            onRead={() => setUnreadCount(0)}
          />
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
          {NAV_MAIN.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive(item.href)
                  ? 'bg-blue-500/10 text-blue-400 font-medium'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <NavIcon name={item.icon} active={isActive(item.href)} />
              {item.label}
            </Link>
          ))}
          <Link
            href="/dashboard/profile"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive('/dashboard/profile')
                ? 'bg-blue-500/10 text-blue-400 font-medium'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <NavIcon name="user" active={isActive('/dashboard/profile')} />
            Profile
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive('/dashboard/admin')
                  ? 'bg-blue-500/10 text-blue-400 font-medium'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <NavIcon name="admin" active={isActive('/dashboard/admin')} />
              Admin
            </Link>
          )}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-[#1e2d4a] flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">
                {userName ?? 'User'}
              </p>
              <p className="text-xs text-slate-500 truncate leading-tight mt-0.5">{userEmail}</p>
            </div>
          </div>
          <form action={logout} className="mt-1">
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors"
            >
              <LogoutIcon />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile bottom nav ──
          7 items: 5 main routes + bell + profile. Minimum touch width ~51px on
          360px devices (above the 44px Apple HIG minimum). Labels are 9px. */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#060b17]/95 backdrop-blur-md border-t border-[#1e2d4a] flex items-stretch h-16">
        {NAV_MAIN.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive(item.href) ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            <NavIcon name={item.icon} active={isActive(item.href)} />
            <span className="text-[9px] leading-none font-medium">
              {item.label.split(' ')[0]}
            </span>
          </Link>
        ))}

        {/* Bell — shows unread badge, opens mobile notification sheet */}
        <button
          type="button"
          onClick={openMobileNotif}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-slate-400 transition-colors relative"
          aria-label="Notifications"
        >
          <div className="relative">
            <BellIcon />
            {unreadCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[9px] leading-none font-medium">Alerts</span>
        </button>

        {/* Profile — opens profile sheet */}
        <button
          type="button"
          onClick={() => setMobileProfileOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
            isActive('/dashboard/profile') ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <NavIcon name="user" active={isActive('/dashboard/profile')} />
          <span className="text-[9px] leading-none font-medium">Profile</span>
        </button>
      </nav>

      {/* ── Mobile notification sheet ── */}
      {mobileNotifOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNotifOpen(false)}
          />
          <div className="relative rounded-t-2xl border-t border-[#1e2d4a] bg-[#060b17]">
            {/* Handle */}
            <div className="mx-auto mt-3 mb-1 h-1 w-10 rounded-full bg-white/10" />
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a]">
              <span className="text-sm font-semibold text-white">Notifications</span>
              <button
                type="button"
                onClick={() => setMobileNotifOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-slate-300 transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {/* List */}
            <div className="max-h-[60vh] overflow-y-auto pb-safe">
              <NotifList
                notifications={mobileNotifications}
                loading={mobileNotifLoading}
                onClose={() => setMobileNotifOpen(false)}
              />
            </div>
            {/* Bottom safe area for home indicator */}
            <div className="h-8" />
          </div>
        </div>
      )}

      {/* ── Mobile profile sheet ── */}
      {mobileProfileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileProfileOpen(false)}
          />
          {/* Sheet */}
          <div className="relative rounded-t-2xl border-t border-[#1e2d4a] bg-[#060b17] px-5 pb-10 pt-5">
            {/* Handle */}
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/10" />

            {/* User info */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName ?? 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{userEmail}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1">
              <Link
                href="/dashboard/profile"
                onClick={() => setMobileProfileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-300 hover:bg-white/[0.05] transition-colors"
              >
                <NavIcon name="user" active={false} />
                View profile
              </Link>

              <form action={logout}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/[0.08] transition-colors"
                >
                  <LogoutIcon />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const cls = `h-[18px] w-[18px] flex-shrink-0 transition-colors ${active ? 'text-blue-400' : ''}`
  const sw = 1.75

  switch (name) {
    case 'home':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      )
    case 'list':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      )
    case 'offers':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'chat':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      )
    case 'user':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      )
    case 'rides':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
      )
    case 'admin':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      )
    default:
      return null
  }
}

function BellIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  )
}
