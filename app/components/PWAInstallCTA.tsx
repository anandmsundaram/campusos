'use client'

import { useState, useEffect } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallCTA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (isStandalone || dismissed) return null

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setDismissed(true)
      setDeferredPrompt(null)
    } else {
      setShowFallback(true)
    }
  }

  return (
    <div
      data-testid="pwa-install-cta"
      className="mt-6 mx-auto max-w-sm rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-center"
    >
      {!showFallback ? (
        <>
          <p className="text-sm font-semibold text-slate-800 mb-2">
            Get the CampusOS app
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Add to your home screen for instant access — no app store needed.
          </p>
          <button
            data-testid="pwa-install-btn"
            type="button"
            onClick={handleInstall}
            className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Add to Home Screen
          </button>
        </>
      ) : (
        <div data-testid="pwa-install-fallback" className="flex items-start gap-3 text-left">
          <span className="text-xl flex-shrink-0">📱</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800 mb-1">Install on Android</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tap the browser menu (⋮ or Share) → <strong>Add to Home Screen</strong>
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
