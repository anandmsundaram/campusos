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
  "missing_fields": string[]
}

Rules:
- category must be exactly one of: rides, moving, peer_help, errands, borrow
- title: short imperative phrase, max 60 chars, e.g. "Ride to SFO on Friday 9am"
- scheduled_time: ISO 8601 if inferable, otherwise null
- urgency: default "medium"; use "high" for words like "urgent", "ASAP", "emergency"
- budget: numeric value in USD if mentioned, otherwise null
- missing_fields: list field names the user did not provide that are typically needed for this category
  - rides: always needs location, scheduled_time
  - moving: always needs location
  - peer_help: always needs description details (if vague, add "description" to missing_fields)
  - errands: always needs location
  - borrow: always needs item details (if vague, add "description" to missing_fields)
- Output only the JSON object, nothing else.`

export async function POST(request: NextRequest) {
  console.log('[parse-request] POST handler entered')

  // 1. Parse request body
  let text: string
  try {
    const body = await request.json()
    console.log('[parse-request] request body:', JSON.stringify(body))
    text = typeof body.text === 'string' ? body.text.trim() : ''
  } catch (err) {
    console.error('[parse-request] failed to parse request body:', err)
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!text) {
    console.log('[parse-request] empty text, returning 400')
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  console.log('[parse-request] calling Anthropic with model: claude-haiku-4-5-20251001, text:', text)

  // 2. Call Anthropic
  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
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
