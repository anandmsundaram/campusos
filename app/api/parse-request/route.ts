import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

console.log('[parse-request] module load — ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY)

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a request parser for CampusOS, a campus help platform.

Extract structured data from a natural language student request. Output ONLY valid JSON — no markdown, no code fences, no extra text.

Output schema (all fields optional except category and title):
{
  "category": "rides" | "moving" | "peer_help" | "errands" | "borrow",
  "title": string,
  "location": string | null,
  "scheduled_time": string | null,
  "urgency": "low" | "medium" | "high",
  "budget": number | null,
  "helper_requirements": string | null,
  "missing_fields": string[],
  "origin_city": string | null,
  "destination_city": string | null,
  "is_driver": boolean | null,
  "available_seats": number | null,
  "is_round_trip": boolean,
  "return_date": string | null,
  "flexible_time": boolean,
  "price_type": "fixed" | "split" | "free" | null,
  "is_airport_ride": boolean
}

Rules:
- category must be exactly one of: rides, moving, peer_help, errands, borrow
- title: short imperative phrase, max 60 chars, e.g. "Ride to SFO on Friday 9am"
- scheduled_time: ISO 8601 if inferable, otherwise null
- urgency: default "medium"; use "high" for words like "urgent", "ASAP", "emergency"
- budget: numeric value in USD if price_type is "fixed" and an amount is stated, otherwise null
- missing_fields: list field names the user did not provide that are typically needed for this category
  - rides: always needs origin_city, destination_city, scheduled_time
  - moving: always needs location
  - peer_help: always needs description details (if vague, add "description" to missing_fields)
  - errands: always needs location
  - borrow: always needs item details (if vague, add "description" to missing_fields)

Ride-specific rules (only when category is "rides"):
- origin_city: city/area the person is departing FROM (e.g. "Dallas", "UTD campus", "Richardson")
- destination_city: city/area the person is going TO (e.g. "DFW Airport", "Austin", "Houston")
- is_driver: true if they say "offering a ride", "have a seat", "can take", "ride available", "driving to"; false if they say "need a ride", "looking for a ride", "can someone take me"; null if ambiguous
- available_seats: number of seats available if they are a driver (e.g. "3 seats" → 3); null otherwise
- is_round_trip: true if they mention "round trip", "coming back", "return trip", "both ways"
- return_date: ISO 8601 return date if is_round_trip and date is mentioned, otherwise null
- flexible_time: true if they say "flexible", "anytime", "whenever works"
- price_type:
  - "fixed" if a specific dollar amount is mentioned (e.g. "$20", "20 bucks per person")
  - "free" if the word "free" is mentioned or they say "no charge"
  - "split" if gas split is mentioned, OR if no price is mentioned at all (default for college rides)
  - null for non-ride categories
- budget: set only when price_type is "fixed" with the numeric amount; null otherwise
- is_airport_ride: true if destination or origin mentions airport keywords: "airport", "IAH", "DFW", "HOU", "AUS", "SAT", "DAL", "Bush", "Intercontinental", "Hobby", "Midway"; false otherwise

For non-ride categories, set origin_city, destination_city, is_driver, available_seats, is_round_trip, return_date, flexible_time to null/false, price_type to null, is_airport_ride to false.

Output only the JSON object, nothing else.`

const WHATSAPP_SYSTEM_SUFFIX = `

IMPORTANT: This request was imported from WhatsApp. It may contain informal language, abbreviations, or group chat context. Extract the core request details and ignore unrelated conversation.`

export async function POST(request: NextRequest) {
  console.log('[parse-request] POST handler entered')

  // 1. Parse request body
  let text: string
  let source: string | undefined
  try {
    const body = await request.json()
    console.log('[parse-request] request body:', JSON.stringify(body))
    text = typeof body.text === 'string' ? body.text.trim() : ''
    source = typeof body.source === 'string' ? body.source : undefined
  } catch (err) {
    console.error('[parse-request] failed to parse request body:', err)
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!text) {
    console.log('[parse-request] empty text, returning 400')
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })
  const DATE_CONTEXT = `\n\nToday is ${today} (US Central Time). Current UTC offset: CDT (UTC−5) from March–November, CST (UTC−6) November–March. Use this to resolve relative dates like "this Saturday", "tomorrow", "next week". IMPORTANT: When outputting scheduled_time, include the UTC offset in the ISO 8601 value. For CDT times, write e.g. "2026-05-23T18:00:00-05:00" for 6pm CDT. Never output bare "Z" UTC timestamps for user-specified local times — always include the -05:00 or -06:00 offset so JavaScript can display the time correctly in the user's timezone.`
  const systemPrompt = (source === 'whatsapp'
    ? SYSTEM_PROMPT + WHATSAPP_SYSTEM_SUFFIX
    : SYSTEM_PROMPT) + DATE_CONTEXT

  console.log('[parse-request] calling Anthropic with model: claude-haiku-4-5-20251001, source:', source ?? 'direct')

  // 2. Call Anthropic
  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    })
    console.log('[parse-request] Anthropic raw response:', JSON.stringify(message))
  } catch (err) {
    const error = err as Error
    console.error('[parse-request] Anthropic API call failed:', error.message)
    console.error('[parse-request] stack:', error.stack)
    return NextResponse.json({ error: 'Anthropic API error', detail: error.message }, { status: 502 })
  }

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  console.log('[parse-request] extracted text content:', raw)

  // 3. Parse JSON
  let parsed: unknown
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    parsed = JSON.parse(cleaned)
    console.log('[parse-request] parsed JSON successfully:', JSON.stringify(parsed))
  } catch (err) {
    const error = err as Error
    console.error('[parse-request] JSON.parse failed:', error.message)
    console.error('[parse-request] raw model output was:', raw)
    return NextResponse.json({ error: 'Model returned invalid JSON', raw }, { status: 502 })
  }

  return NextResponse.json(parsed)
}
