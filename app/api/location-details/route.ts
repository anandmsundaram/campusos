import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Location details unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const placeId = searchParams.get('placeId')
  const sessionToken = searchParams.get('sessionToken') ?? ''

  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 })
  }

  const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`)
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken)

  const res = await fetch(url.toString(), {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'displayName,formattedAddress,location',
    },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch place details' }, { status: res.status })
  }

  const data = await res.json()

  return NextResponse.json({
    place_name: data.displayName?.text ?? '',
    formatted_address: data.formattedAddress ?? '',
    place_id: placeId,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
  })
}
