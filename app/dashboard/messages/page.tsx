'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics'
import ReportModal from '@/app/components/ReportModal'

interface MessageRow {
  id: string
  sender_id: string
  receiver_id: string
  request_id: string | null
  content: string
  created_at: string
  request_title?: string | null
  request_category?: string | null
  other_name?: string | null
}

interface Conversation {
  key: string
  request_id: string | null
  request_title: string | null
  request_category: string | null
  other_user_id: string
  other_name: string | null
  last_message: string
  last_at: string
  messages: MessageRow[]
}

const CATEGORY_ACCENT: Record<string, string> = {
  rides: 'bg-blue-500', moving: 'bg-orange-500', peer_help: 'bg-green-500',
  errands: 'bg-purple-500', borrow: 'bg-pink-500',
}

function buildConversations(messages: MessageRow[], userId: string): Conversation[] {
  const convMap = new Map<string, Conversation>()

  for (const msg of messages) {
    const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
    const key = `${msg.request_id ?? 'direct'}:${otherId}`

    if (!convMap.has(key)) {
      convMap.set(key, {
        key,
        request_id: msg.request_id ?? null,
        request_title: msg.request_title ?? null,
        request_category: msg.request_category ?? null,
        other_user_id: otherId,
        other_name: msg.other_name ?? null,
        last_message: msg.content,
        last_at: msg.created_at,
        messages: [],
      })
    }

    const conv = convMap.get(key)!
    conv.messages.push(msg)

    if (new Date(msg.created_at) > new Date(conv.last_at)) {
      conv.last_message = msg.content
      conv.last_at = msg.created_at
    }
    if (!conv.other_name && msg.other_name) {
      conv.other_name = msg.other_name
    }
  }

  return Array.from(convMap.values())
    .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
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

export default function MessagesPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [rawMessages, setRawMessages] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [reportConv, setReportConv] = useState<{ id: string; name?: string } | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, request_id, content, created_at')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: true })
      .limit(1000)

    if (!msgs || msgs.length === 0) {
      setLoading(false)
      return
    }

    const requestIds = [...new Set(msgs.map(m => m.request_id).filter(Boolean))] as string[]
    const otherIds = [...new Set(msgs.map(m => m.sender_id === user.id ? m.receiver_id : m.sender_id))]

    const [reqResult, profileResult] = await Promise.all([
      requestIds.length > 0
        ? supabase.from('requests').select('id, title, category').in('id', requestIds)
        : Promise.resolve({ data: [] }),
      supabase.from('profiles').select('id, name').in('id', otherIds),
    ])

    const reqMap = new Map((reqResult.data ?? []).map((r: { id: string; title: string; category: string }) => [r.id, r]))
    const profileMap = new Map((profileResult.data ?? []).map((p: { id: string; name: string | null }) => [p.id, p]))

    const enriched: MessageRow[] = msgs.map(m => {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id
      const req = m.request_id ? reqMap.get(m.request_id) : null
      const otherProfile = profileMap.get(otherId)
      return {
        ...m,
        request_title: req?.title ?? null,
        request_category: req?.category ?? null,
        other_name: otherProfile?.name ?? null,
      }
    })

    setRawMessages(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { trackEvent('messages_opened') }, [])

  // Scroll to bottom whenever selected conversation or message count changes
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedKey, rawMessages.length])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel('messages-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as { id: string; sender_id: string; receiver_id: string; request_id: string | null; content: string; created_at: string }
        if (msg.sender_id !== userId && msg.receiver_id !== userId) return

        setRawMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev

          const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
          const existingConv = buildConversations(prev, userId).find(c => c.other_user_id === otherId)

          return [...prev, {
            ...msg,
            request_title: existingConv?.request_title ?? null,
            request_category: existingConv?.request_category ?? null,
            other_name: existingConv?.other_name ?? null,
          }]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || !userId || !selectedConv || sending) return
    setSendError(null)
    setSending(true)

    const content = draft.trim()
    const tempId = `temp-${Date.now()}`

    const optimistic: MessageRow = {
      id: tempId,
      sender_id: userId,
      receiver_id: selectedConv.other_user_id,
      request_id: selectedConv.request_id,
      content,
      created_at: new Date().toISOString(),
      request_title: selectedConv.request_title,
      request_category: selectedConv.request_category,
      other_name: selectedConv.other_name,
    }
    setRawMessages(prev => [...prev, optimistic])
    setDraft('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const supabase = createClient()
    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        sender_id: userId,
        receiver_id: selectedConv.other_user_id,
        request_id: selectedConv.request_id ?? undefined,
        content,
      })
      .select('id')
      .single()

    if (error) {
      setRawMessages(prev => prev.filter(m => m.id !== tempId))
      setSendError(error.message)
    } else if (inserted) {
      setRawMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: inserted.id } : m))

      // Notify the receiver
      await supabase.from('notifications').insert({
        user_id: selectedConv.other_user_id,
        type: 'new_message',
        message: selectedConv.request_title
          ? `New message about "${selectedConv.request_title}"`
          : 'You have a new message',
        related_request_id: selectedConv.request_id ?? undefined,
      })
    }

    setSending(false)
  }

  const conversations = userId ? buildConversations(rawMessages, userId) : []
  const selectedConv = conversations.find(c => c.key === selectedKey) ?? null
  const threadMessages = selectedConv
    ? [...selectedConv.messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : []

  const showList = !selectedKey
  const showThread = !!selectedKey

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Spinner /> Loading messages…
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="flex h-[calc(100vh-0px)] md:h-screen overflow-hidden">
      {/* Conversation list */}
      <div className={`${showThread ? 'hidden md:flex' : 'flex'} w-full md:w-72 flex-col border-r border-[#1e2d4a] bg-[#060b17] flex-shrink-0`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[#1e2d4a]">
          <h1 className="text-sm font-semibold text-white">Messages</h1>
          {conversations.length > 0 && (
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
              {conversations.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="mb-3 text-3xl">💬</div>
              <p className="text-sm font-semibold text-slate-300">No messages yet</p>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Messages appear here once an offer is accepted. Post a request or offer to help — then chat directly with the other student.
              </p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.key}
                type="button"
                onClick={() => setSelectedKey(conv.key)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-[#1e2d4a] transition-colors text-left ${
                  selectedKey === conv.key ? 'bg-blue-500/[0.08]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-700/30 text-sm font-semibold text-blue-300">
                  {conv.other_name ? conv.other_name[0].toUpperCase() : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-white truncate">{conv.other_name ?? 'Unknown'}</span>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(conv.last_at)}</span>
                  </div>
                  {conv.request_title && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {conv.request_category && (
                        <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${CATEGORY_ACCENT[conv.request_category] ?? 'bg-slate-500'}`} />
                      )}
                      <span className="text-[11px] text-slate-500 truncate">{conv.request_title}</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-600 truncate mt-0.5">{conv.last_message}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className={`${showList ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#0a0f1e]`}>
        {!selectedConv ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
            <div className="mb-3 text-4xl opacity-30">💬</div>
            <p className="text-sm text-slate-500">Select a conversation</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1e2d4a] bg-[#060b17]">
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="md:hidden flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                ←
              </button>
              <div className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-700/30 text-sm font-semibold text-blue-300">
                {selectedConv.other_name ? selectedConv.other_name[0].toUpperCase() : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{selectedConv.other_name ?? 'Unknown'}</p>
                {selectedConv.request_title && (
                  <p className="text-xs text-slate-500 truncate">Re: {selectedConv.request_title}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReportConv({ id: selectedConv.other_user_id, name: selectedConv.other_name ?? undefined })}
                className="flex-shrink-0 text-[10px] text-slate-700 hover:text-red-400/70 transition-colors px-1"
                title="Report this user"
              >
                Report
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3">
              {threadMessages.length === 0 && (
                <p className="text-center text-xs text-slate-600 py-4">No messages yet. Say hello!</p>
              )}
              {threadMessages.map(msg => {
                const isMine = msg.sender_id === userId
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        isMine
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-[#0d1526] border border-[#1e2d4a] text-slate-200 rounded-bl-sm'
                      }`}
                    >
                      <p>{msg.content}</p>
                      <p className={`mt-1 text-[10px] ${isMine ? 'text-blue-200/60' : 'text-slate-600'}`}>
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={threadEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[#1e2d4a] bg-[#060b17] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              {sendError && <p className="mb-2 text-xs text-red-400">{sendError}</p>}
              <form onSubmit={handleSend} className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                  onChange={e => {
                    setDraft(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend(e as unknown as React.FormEvent)
                    }
                  }}
                  placeholder="Type a message… (Enter to send)"
                  disabled={sending}
                  className="flex-1 resize-none rounded-xl border border-[#1e2d4a] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50 overflow-hidden"
                  style={{ minHeight: '42px' }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
    {reportConv && (
      <ReportModal
        targetType="user"
        targetId={reportConv.id}
        displayName={reportConv.name}
        onClose={() => setReportConv(null)}
      />
    )}
    </>
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
