import { NextRequest, NextResponse } from 'next/server'
import { CAMPUS_CONFIG, type CampusPlace } from '@/lib/campus-config'
import type { LocationSuggestion } from '@/lib/location-types'

// Maps short category/cuisine terms → richer queries for Google Autocomplete.
// Only exact-match on the lowercased, trimmed query string.
const QUERY_EXPANSIONS: Readonly<Record<string, string>> = {
  // Cuisine categories
  thai: 'Thai restaurant',
  'thai food': 'Thai restaurant',
  mexican: 'Mexican restaurant',
  'mexican food': 'Mexican restaurant',
  chinese: 'Chinese restaurant',
  'chinese food': 'Chinese restaurant',
  japanese: 'Japanese restaurant',
  korean: 'Korean restaurant',
  italian: 'Italian restaurant',
  indian: 'Indian restaurant',
  'indian food': 'Indian restaurant',
  sushi: 'sushi restaurant',
  ramen: 'ramen restaurant',
  pho: 'pho restaurant',
  burger: 'burger restaurant',
  burgers: 'burger restaurant',
  wings: 'wings restaurant',
  bbq: 'BBQ restaurant',
  barbeque: 'BBQ restaurant',
  barbecue: 'BBQ restaurant',
  pizza: 'pizza restaurant',
  tacos: 'taco restaurant',
  coffee: 'coffee shop',
  cafe: 'cafe',
  'ice cream': 'ice cream shop',
  'fast food': 'fast food restaurant',
  breakfast: 'breakfast restaurant',
  // General place categories
  grocery: 'grocery store',
  groceries: 'grocery store',
  pharmacy: 'pharmacy',
  gym: 'gym',
  bank: 'bank',
  hotel: 'hotel',
  hospital: 'hospital',
  clinic: 'clinic',
  'gas station': 'gas station',
}

function expandQuery(query: string): string {
  return QUERY_EXPANSIONS[query.toLowerCase().trim()] ?? query
}

function scoreCampusPlace(place: CampusPlace, query: string): number {
  const q = query.toLowerCase().trim()
  const name = place.name.toLowerCase()

  if (name === q) return 100
  if (place.aliases.some(a => a.toLowerCase() === q)) return 90
  if (name.includes(q)) return 70
  if (place.aliases.some(a => a.toLowerCase().includes(q))) return 60

  const words = q.split(/\s+/)
  const matchCount = words.filter(w => name.includes(w) || place.aliases.some(a => a.toLowerCase().includes(w))).length
  if (matchCount > 0) return matchCount * 20

  return 0
}

function searchCampusPlaces(query: string): LocationSuggestion[] {
  if (!query || query.trim().length < 2) return []

  return CAMPUS_CONFIG.places
    .map(place => ({ place, score: scoreCampusPlace(place, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ place }) => ({
      place_name: place.name,
      formatted_address: place.formatted_address,
      lat: place.lat,
      lng: place.lng,
      source: 'campus_place' as const,
      needs_details: false,
    }))
}

interface GoogleSearchResult {
  suggestions: LocationSuggestion[]
  provider_ok: boolean
}

async function searchGooglePlaces(
  query: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  sessionToken: string,
): Promise<GoogleSearchResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('[location-search] GOOGLE_PLACES_API_KEY not set — provider search disabled')
    return { suggestions: [], provider_ok: false }
  }

  const expandedQuery = expandQuery(query)

  let res: Response
  try {
    res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: expandedQuery,
        sessionToken,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
      }),
    })
  } catch (err) {
    console.error('[location-search] provider fetch failed query=%j error=%s', query, String(err))
    return { suggestions: [], provider_ok: false }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(unreadable)')
    console.error('[location-search] provider error http=%d query=%j expanded=%j body=%s',
      res.status, query, expandedQuery, errBody.slice(0, 300))
    return { suggestions: [], provider_ok: false }
  }

  const data = await res.json()
  const predictions: Array<{
    placePrediction?: {
      placeId?: string
      text?: { text?: string }
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
    }
  }> = data.suggestions ?? []

  const suggestions = predictions
    .slice(0, 5)
    .reduce<LocationSuggestion[]>((acc, p) => {
      const pred = p.placePrediction
      if (!pred) return acc
      const mainText = pred.structuredFormat?.mainText?.text ?? pred.text?.text ?? ''
      const secondaryText = pred.structuredFormat?.secondaryText?.text ?? ''
      if (!mainText) return acc
      acc.push({
        place_name: mainText,
        formatted_address: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
        place_id: pred.placeId,
        source: 'places_provider',
        needs_details: true,
      })
      return acc
    }, [])

  console.log('[location-search] provider_ok query=%j expanded=%j result_count=%d',
    query, expandedQuery, suggestions.length)

  return { suggestions, provider_ok: true }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') ?? ''
  const lat = parseFloat(searchParams.get('lat') ?? String(CAMPUS_CONFIG.center_lat))
  const lng = parseFloat(searchParams.get('lng') ?? String(CAMPUS_CONFIG.center_lng))
  const radius = parseInt(searchParams.get('r') ?? String(CAMPUS_CONFIG.search_radius_meters), 10)
  const sessionToken = searchParams.get('sessionToken') ?? ''

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [], provider_ok: true })
  }

  const campusResults = searchCampusPlaces(query)

  const { suggestions: googleResults, provider_ok } = await searchGooglePlaces(
    query,
    isNaN(lat) ? CAMPUS_CONFIG.center_lat : lat,
    isNaN(lng) ? CAMPUS_CONFIG.center_lng : lng,
    isNaN(radius) ? CAMPUS_CONFIG.search_radius_meters : radius,
    sessionToken,
  )

  const results: LocationSuggestion[] = [...campusResults, ...googleResults].slice(0, 8)

  return NextResponse.json({ results, provider_ok })
}
