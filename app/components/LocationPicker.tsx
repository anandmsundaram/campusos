'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { ResolvedLocation, LocationSuggestion } from '@/lib/location-types'

const CAMPUS_LAT = parseFloat(process.env.NEXT_PUBLIC_CAMPUS_LAT ?? '30.6180')
const CAMPUS_LNG = parseFloat(process.env.NEXT_PUBLIC_CAMPUS_LNG ?? '-96.3365')
const CAMPUS_RADIUS = parseInt(process.env.NEXT_PUBLIC_CAMPUS_RADIUS_M ?? '8000', 10)

// Truly vague terms — no search fires for these single-word inputs
const NO_SEARCH_TERMS = new Set([
  'my dorm', 'dorm', 'campus', 'home', 'here', 'there',
  'the store', 'nearby', 'close', 'school', 'work', 'store', 'market', 'mall',
])

// Place/store names — valid search targets but suppress "use this address" option
const NO_MANUAL_TERMS = new Set([
  'target', 'walmart', 'costco', 'heb', 'kroger', 'whataburger', 'aldi', 'airport',
])

function isTooVague(q: string): boolean {
  return NO_SEARCH_TERMS.has(q.toLowerCase().trim())
}

function looksLikeAddress(q: string): boolean {
  return /^\d+\s+\w/.test(q.trim())
}

interface LocationPickerProps {
  value: ResolvedLocation | null
  onChange: (loc: ResolvedLocation | null) => void
  hint?: string
  placeholder?: string
  label?: string
  required?: boolean
  'data-testid'?: string
}

export function LocationPicker({
  value,
  onChange,
  hint,
  placeholder = 'Search location…',
  'data-testid': testId,
}: LocationPickerProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isFetchingDetails, setIsFetchingDetails] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [showWarning, setShowWarning] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const sessionTokenRef = useRef<string>(crypto.randomUUID())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync hint into input when no value selected and user hasn't typed
  useEffect(() => {
    if (!value && !hasInteracted && hint) {
      setInputValue(hint)
    }
  }, [hint, value, hasInteracted])

  // Click-outside to close dropdown
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2 || isTooVague(q)) {
      setSuggestions([])
      setIsOpen(false)
      return
    }
    setIsSearching(true)
    setIsOpen(true) // Open immediately so loading state renders
    try {
      const params = new URLSearchParams({
        q,
        lat: String(CAMPUS_LAT),
        lng: String(CAMPUS_LNG),
        r: String(CAMPUS_RADIUS),
        sessionToken: sessionTokenRef.current,
      })
      const res = await fetch(`/api/location-search?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.results ?? [])
      }
    } finally {
      setIsSearching(false)
    }
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setInputValue(q)
    setHasInteracted(true)
    setShowWarning(false)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 400)
  }

  function handleInputFocus() {
    const q = inputValue.trim()
    if (q.length >= 2) {
      if (suggestions.length > 0) {
        setIsOpen(true)
      } else if (!hasInteracted) {
        // Hint pre-fill: user hasn't typed yet — trigger a search automatically
        search(q)
      }
    }
  }

  async function selectSuggestion(suggestion: LocationSuggestion) {
    setIsOpen(false)

    if (!suggestion.needs_details) {
      onChange({
        place_name: suggestion.place_name,
        formatted_address: suggestion.formatted_address,
        place_id: suggestion.place_id,
        lat: suggestion.lat,
        lng: suggestion.lng,
        source: suggestion.source,
        original_query: inputValue,
      })
      setInputValue(suggestion.place_name)
      return
    }

    if (!suggestion.place_id) return
    setIsFetchingDetails(true)
    try {
      const params = new URLSearchParams({
        placeId: suggestion.place_id,
        sessionToken: sessionTokenRef.current,
      })
      const res = await fetch(`/api/location-details?${params}`)
      if (res.ok) {
        const data = await res.json()
        onChange({
          place_name: data.place_name || suggestion.place_name,
          formatted_address: data.formatted_address || suggestion.formatted_address,
          place_id: data.place_id,
          lat: data.lat,
          lng: data.lng,
          source: 'places_provider',
          original_query: inputValue,
        })
        setInputValue(data.place_name || suggestion.place_name)
        sessionTokenRef.current = crypto.randomUUID()
      }
    } finally {
      setIsFetchingDetails(false)
    }
  }

  function selectManualAddress() {
    setIsOpen(false)
    onChange({
      place_name: inputValue.trim(),
      formatted_address: inputValue.trim(),
      source: 'manual_address',
      original_query: inputValue,
    })
  }

  function clearSelection() {
    onChange(null)
    setInputValue('')
    setHasInteracted(true)
    setSuggestions([])
    setShowWarning(false)
    sessionTokenRef.current = crypto.randomUUID()
  }

  if (value) {
    const isManual = value.source === 'manual_address'
    return (
      <div data-testid={testId} className="flex items-center gap-2">
        <div
          data-testid={isManual ? 'location-chip-unverified' : 'location-chip'}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
            isManual
              ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
              : 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30'
          }`}
        >
          {isManual ? (
            <>
              <span>⚠</span>
              <span>Manual address — not verified</span>
            </>
          ) : (
            <>
              <span>📍</span>
              <span>{value.place_name}</span>
            </>
          )}
        </div>
        <button
          onClick={clearSelection}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Clear location"
        >
          ✕
        </button>
      </div>
    )
  }

  const campusSuggestions = suggestions.filter(s => s.source === 'campus_place')
  const nearbySuggestions = suggestions.filter(s => s.source === 'places_provider')
  const lower = inputValue.toLowerCase().trim()
  const showManualOption =
    looksLikeAddress(inputValue) &&
    !NO_SEARCH_TERMS.has(lower) &&
    !NO_MANUAL_TERMS.has(lower) &&
    !isSearching &&
    hasInteracted
  const showEmptyState =
    isOpen && !isSearching && suggestions.length === 0 && !showManualOption && inputValue.trim().length >= 2
  const showDropdown =
    isOpen &&
    inputValue.trim().length >= 2 &&
    (isSearching || campusSuggestions.length > 0 || nearbySuggestions.length > 0 || showManualOption || showEmptyState)

  return (
    <div ref={containerRef} data-testid={testId} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
        />
        {(isSearching || isFetchingDetails) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
          </div>
        )}
      </div>

      {showWarning && (
        <p
          data-testid="location-picker-warning"
          className="mt-1 text-xs text-amber-400"
        >
          Select a specific location from the list to continue.
        </p>
      )}

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
          {isSearching && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500">
              <div className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
              Searching…
            </div>
          )}

          {campusSuggestions.length > 0 && (
            <>
              <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                On campus
              </p>
              {campusSuggestions.map((s, i) => (
                <button
                  key={i}
                  data-testid="location-suggestion"
                  onClick={() => selectSuggestion(s)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm text-slate-200">{s.place_name}</span>
                  <span className="text-xs text-slate-500">{s.formatted_address}</span>
                </button>
              ))}
            </>
          )}

          {nearbySuggestions.length > 0 && (
            <>
              <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Nearby
              </p>
              {nearbySuggestions.map((s, i) => (
                <button
                  key={i}
                  data-testid="location-suggestion"
                  onClick={() => selectSuggestion(s)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-slate-800 transition-colors"
                >
                  <span className="text-sm text-slate-200">{s.place_name}</span>
                  <span className="text-xs text-slate-500">{s.formatted_address}</span>
                </button>
              ))}
            </>
          )}

          {showManualOption && (
            <>
              {(campusSuggestions.length > 0 || nearbySuggestions.length > 0) && (
                <div className="my-1 border-t border-slate-800" />
              )}
              <button
                data-testid="location-manual-option"
                onClick={selectManualAddress}
                className="flex w-full flex-col gap-0.5 px-3 py-2 pb-3 text-left hover:bg-slate-800 transition-colors"
              >
                <span className="text-sm text-amber-300">Use this address (not verified)</span>
                <span className="text-xs text-slate-500">{inputValue.trim()}</span>
              </button>
            </>
          )}

          {showEmptyState && (
            <div
              data-testid="location-empty-state"
              className="px-3 py-3 text-xs text-slate-500"
            >
              No matches. Try a more specific place, business, or address.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
