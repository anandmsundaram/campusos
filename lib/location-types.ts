export interface ResolvedLocation {
  place_name: string
  formatted_address: string
  place_id?: string
  lat?: number
  lng?: number
  source: 'campus_place' | 'places_provider' | 'manual_address'
  original_query: string
}

export interface LocationSuggestion {
  place_name: string
  formatted_address: string
  place_id?: string
  lat?: number
  lng?: number
  source: 'campus_place' | 'places_provider'
  needs_details: boolean
}
