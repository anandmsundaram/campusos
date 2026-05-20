import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const origin = searchParams.get('origin_city')?.trim()
  const destination = searchParams.get('destination_city')?.trim()
  const scheduledTime = searchParams.get('scheduled_time')?.trim()

  if (!origin || !destination) {
    return NextResponse.json({ error: 'origin_city and destination_city are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Build query — case-insensitive city match, open status
  let query = supabase
    .from('requests')
    .select('id, title, category, urgency, status, location, budget, scheduled_time, created_at, requester_id, origin_city, destination_city, is_driver, available_seats, is_round_trip, flexible_time, profiles!requester_id(name, rating)')
    .eq('category', 'rides')
    .eq('status', 'open')
    .neq('requester_id', user.id)
    .ilike('origin_city', `%${origin}%`)
    .ilike('destination_city', `%${destination}%`)

  // Filter within ±3 hours of the requested time if provided
  if (scheduledTime) {
    const t = new Date(scheduledTime)
    const low = new Date(t.getTime() - 3 * 60 * 60 * 1000).toISOString()
    const high = new Date(t.getTime() + 3 * 60 * 60 * 1000).toISOString()
    query = query.gte('scheduled_time', low).lte('scheduled_time', high)
  }

  const { data, error } = await query.limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sort: time proximity → rating → price
  const center = scheduledTime ? new Date(scheduledTime).getTime() : null
  const sorted = (data ?? []).sort((a, b) => {
    // Time proximity
    if (center && a.scheduled_time && b.scheduled_time) {
      const diffA = Math.abs(new Date(a.scheduled_time).getTime() - center)
      const diffB = Math.abs(new Date(b.scheduled_time).getTime() - center)
      if (diffA !== diffB) return diffA - diffB
    }
    // Rating (higher is better)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ratingA = Array.isArray(a.profiles) ? ((a.profiles as any)[0]?.rating ?? 0) : ((a.profiles as any)?.rating ?? 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ratingB = Array.isArray(b.profiles) ? ((b.profiles as any)[0]?.rating ?? 0) : ((b.profiles as any)?.rating ?? 0)
    if (ratingA !== ratingB) return ratingB - ratingA
    // Price (lower is better)
    return (a.budget ?? Infinity) - (b.budget ?? Infinity)
  })

  return NextResponse.json(sorted)
}
