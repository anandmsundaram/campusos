import { NextRequest, NextResponse } from 'next/server'
import { CAMPUS_CONFIG, type CampusPlace } from '@/lib/campus-config'
import type { LocationSuggestion } from '@/lib/location-types'

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

async function searchGooglePlaces(
  query: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  sessionToken: string,
): Promise<LocationSuggestion[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return []

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
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

  if (!res.ok) return []

  const data = await res.json()
  const predictions: Array<{
    placePrediction?: {
      placeId?: string
      text?: { text?: string }
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
    }
  }> = data.suggestions ?? []

  return predictions
    .slice(0, 5)
    .reduce<LocationSuggestion[]>((acc, p) => {
      const pred = p.placePrediction
      if (!pred) return acc
      const mainText = pred.structuredFormat?.mainText?.text ?? pred.text?.text ?? ''
      const secondaryText = pred.structuredFormat?.secondaryText?.text ?? ''
      acc.push({
        place_name: mainText,
        formatted_address: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
        place_id: pred.placeId,
        source: 'places_provider',
        needs_details: true,
      })
      return acc
    }, [])
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') ?? ''
  const lat = parseFloat(searchParams.get('lat') ?? String(CAMPUS_CONFIG.center_lat))
  const lng = parseFloat(searchParams.get('lng') ?? String(CAMPUS_CONFIG.center_lng))
  const radius = parseInt(searchParams.get('r') ?? String(CAMPUS_CONFIG.search_radius_meters), 10)
  const sessionToken = searchParams.get('sessionToken') ?? ''

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  const campusResults = searchCampusPlaces(query)

  const googleResults = await searchGooglePlaces(
    query,
    isNaN(lat) ? CAMPUS_CONFIG.center_lat : lat,
    isNaN(lng) ? CAMPUS_CONFIG.center_lng : lng,
    isNaN(radius) ? CAMPUS_CONFIG.search_radius_meters : radius,
    sessionToken,
  )

  const results: LocationSuggestion[] = [...campusResults, ...googleResults].slice(0, 8)

  return NextResponse.json({ results })
}
