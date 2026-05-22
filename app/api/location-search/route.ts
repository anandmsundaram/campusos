import { NextRequest, NextResponse } from 'next/server'
import { CAMPUS_CONFIG, type CampusPlace } from '@/lib/campus-config'
import type { LocationSuggestion } from '@/lib/location-types'

// ─── Category / cuisine detection ─────────────────────────────────────────────
//
// These terms trigger Google Places Text Search (finds actual places by category)
// rather than Autocomplete (completes place names). Exact match on the lowercased,
// trimmed user query. Brand names (Target, HEB) are NOT here — Autocomplete
// handles them correctly since they're specific place names.
const CATEGORY_TEXT_QUERIES: Readonly<Record<string, string>> = {
  // Cuisine
  thai: 'Thai restaurants',
  'thai food': 'Thai restaurants',
  mexican: 'Mexican restaurants',
  'mexican food': 'Mexican restaurants',
  chinese: 'Chinese restaurants',
  'chinese food': 'Chinese restaurants',
  japanese: 'Japanese restaurants',
  korean: 'Korean restaurants',
  italian: 'Italian restaurants',
  indian: 'Indian restaurants',
  'indian food': 'Indian restaurants',
  vietnamese: 'Vietnamese restaurants',
  mediterranean: 'Mediterranean restaurants',
  sushi: 'sushi restaurants',
  ramen: 'ramen restaurants',
  pho: 'pho restaurants',
  pizza: 'pizza restaurants',
  burger: 'burger restaurants',
  burgers: 'burger restaurants',
  tacos: 'taco restaurants',
  taco: 'taco restaurants',
  wings: 'wings restaurants',
  bbq: 'BBQ restaurants',
  barbeque: 'BBQ restaurants',
  barbecue: 'BBQ restaurants',
  coffee: 'coffee shops',
  cafe: 'cafes',
  cafes: 'cafes',
  breakfast: 'breakfast restaurants',
  brunch: 'brunch restaurants',
  'ice cream': 'ice cream shops',
  'fast food': 'fast food restaurants',
  restaurant: 'restaurants',
  restaurants: 'restaurants',
  // Place categories
  grocery: 'grocery stores',
  groceries: 'grocery stores',
  'grocery store': 'grocery stores',
  pharmacy: 'pharmacies',
  drugstore: 'drugstores',
  gym: 'gyms',
  fitness: 'fitness centers',
  bank: 'banks',
  atm: 'ATM',
  hotel: 'hotels',
  motel: 'motels',
  hospital: 'hospitals',
  clinic: 'clinics',
  'gas station': 'gas stations',
  gas: 'gas stations',
  airport: 'airports',
}

// ─── Campus place fuzzy search ────────────────────────────────────────────────

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

// ─── Provider result shape ─────────────────────────────────────────────────────

interface GoogleSearchResult {
  suggestions: LocationSuggestion[]
  provider_ok: boolean
}

// ─── Text Search — for category/cuisine queries ───────────────────────────────
//
// Uses /v1/places:searchText which accepts a natural-language query and returns
// matching places with coordinates. This is the correct API for "Thai restaurants",
// "coffee shops", "grocery stores" etc. Results include lat/lng so needs_details=false
// — no second /api/location-details call is required when the user selects a result.

async function searchGooglePlacesTextSearch(
  textQuery: string,
  originalQuery: string,
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<GoogleSearchResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('[location-search] GOOGLE_PLACES_API_KEY not set — provider search disabled')
    return { suggestions: [], provider_ok: false }
  }

  let res: Response
  try {
    res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        textQuery,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
        maxResultCount: 5,
      }),
    })
  } catch (err) {
    console.error('[location-search] text-search fetch failed query=%j error=%s', originalQuery, String(err))
    return { suggestions: [], provider_ok: false }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(unreadable)')
    console.error('[location-search] text-search error http=%d query=%j text_query=%j body=%s',
      res.status, originalQuery, textQuery, errBody.slice(0, 300))
    return { suggestions: [], provider_ok: false }
  }

  const data = await res.json()
  const places: Array<{
    id?: string
    displayName?: { text?: string }
    formattedAddress?: string
    location?: { latitude?: number; longitude?: number }
  }> = data.places ?? []

  const suggestions = places.slice(0, 5).reduce<LocationSuggestion[]>((acc, place) => {
    const name = place.displayName?.text ?? ''
    const address = place.formattedAddress ?? ''
    if (!name) return acc
    acc.push({
      place_name: name,
      formatted_address: address,
      place_id: place.id,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      source: 'places_provider',
      needs_details: false, // Text Search includes lat/lng — no details call needed
    })
    return acc
  }, [])

  console.log('[location-search] text-search query=%j text_query=%j result_count=%d',
    originalQuery, textQuery, suggestions.length)

  return { suggestions, provider_ok: true }
}

// ─── Autocomplete — for brand names, addresses, specific places ───────────────
//
// Uses /v1/places:autocomplete which completes place names as the user types.
// Correct for: "Target", "Walmart", "HEB", "124 Main St", "Zachry", etc.
// NOT correct for category/cuisine searches (use Text Search instead).
// Results require a /api/location-details call to get lat/lng (needs_details=true).

async function searchGooglePlacesAutocomplete(
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

  let res: Response
  try {
    res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: query,
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
    console.error('[location-search] autocomplete fetch failed query=%j error=%s', query, String(err))
    return { suggestions: [], provider_ok: false }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(unreadable)')
    console.error('[location-search] autocomplete error http=%d query=%j body=%s',
      res.status, query, errBody.slice(0, 300))
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
        needs_details: true, // Autocomplete has no lat/lng — details call required on selection
      })
      return acc
    }, [])

  console.log('[location-search] autocomplete query=%j result_count=%d', query, suggestions.length)

  return { suggestions, provider_ok: true }
}

// ─── Route handler ─────────────────────────────────────────────────────────────

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

  const resolvedLat = isNaN(lat) ? CAMPUS_CONFIG.center_lat : lat
  const resolvedLng = isNaN(lng) ? CAMPUS_CONFIG.center_lng : lng
  const resolvedRadius = isNaN(radius) ? CAMPUS_CONFIG.search_radius_meters : radius

  const campusResults = searchCampusPlaces(query)

  // Route to Text Search for category/cuisine terms, Autocomplete for everything else
  const textQuery = CATEGORY_TEXT_QUERIES[query.toLowerCase().trim()]
  const { suggestions: googleResults, provider_ok } = textQuery
    ? await searchGooglePlacesTextSearch(textQuery, query, resolvedLat, resolvedLng, resolvedRadius)
    : await searchGooglePlacesAutocomplete(query, resolvedLat, resolvedLng, resolvedRadius, sessionToken)

  const results: LocationSuggestion[] = [...campusResults, ...googleResults].slice(0, 8)

  return NextResponse.json({ results, provider_ok })
}
