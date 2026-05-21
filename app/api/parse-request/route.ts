import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

console.log('[parse-request] module load — ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY)

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a request parser for CampusOS, a campus coordination platform where students help each other.

Extract structured data from a natural language student request. Output ONLY valid JSON — no markdown, no code fences, no extra text.

Output schema (all fields required in output, use null/false for unknown):
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
  "is_airport_ride": boolean,
  "is_offer": boolean,
  "ambiguous": boolean,
  "clarification_question": string | null,
  "clarification_options": [{"label": string, "appended_text": string}] | null,
  "summary": string,
  "payment_mode_unclear": boolean,
  "structured_data": object
}

General rules:
- category must be exactly one of: rides, moving, peer_help, errands, borrow
- title: short imperative phrase, max 60 chars, e.g. "Ride to SFO on Friday 9am"
- scheduled_time: ISO 8601 if inferable, otherwise null
- urgency: default "medium"; use "high" for "urgent", "ASAP", "emergency"
- budget: numeric USD amount only when price_type is "fixed"; null otherwise
- For non-ride categories: set origin_city=null, destination_city=null, is_driver=null, available_seats=null, is_round_trip=false, return_date=null, flexible_time=false, price_type=null, is_airport_ride=false
- is_offer: true if the user is OFFERING help (not requesting it). Offer signals: "I'm going to [place]", "I can help", "I can drive", "I have [seats/item]", "I'm available to", "anyone need anything while I'm at", "I can tutor", "I can lend", "I'm heading to", "offering". False if requesting help.
- ambiguous: true ONLY when the intent is genuinely unclear — e.g. "Anyone going to Walmart?" (ride? errand? checking?), "Need Target tomorrow" (ride there? pickup?), "Can someone help Saturday?" (with what?). Do NOT set ambiguous if a category can reasonably be inferred. If ambiguous, still pick the most likely category.
- clarification_question: when ambiguous=true, a short natural question (5-10 words, e.g. "What do you need?"). null when not ambiguous.
- clarification_options: when ambiguous=true, 2-4 options. Each has "label" (emoji + short phrase ≤30 chars) and "appended_text" (3-8 word phrase appended to original text to clarify intent, e.g. "I need a ride there" or "I need someone to pick something up"). null when not ambiguous.
- summary: ALWAYS required. 1-2 complete natural language sentences describing the request/offer. Preserve human context. Example — BAD: "Walmart run". GOOD: "Need someone going to Walmart on Harvey Mitchell to pick up milk and eggs." For offers: "Offering 3 seats to Houston Friday morning, splitting gas."
- payment_mode_unclear: true if user mentioned any payment concept (pay, Venmo, CashApp, gas, split, cash, money, will pay, paid) but the specific mode cannot be determined. false if payment not mentioned, or if mode is clear.

Ride-specific rules (category "rides" only):
- origin_city: city/area departing FROM
- destination_city: city/area going TO
- is_driver: true if offering ride; false if needing ride; null if ambiguous
- available_seats: seats available if driver; null otherwise
- is_round_trip: true if "round trip", "coming back", "return trip", "both ways"
- return_date: ISO 8601 return date if is_round_trip and date given, else null
- flexible_time: true if "flexible", "anytime", "whenever works"
- price_type: "fixed" if dollar amount stated; "free" if free; "split" if gas split or no price (default); null for non-rides
- budget: numeric amount only when price_type is "fixed"
- is_airport_ride: true if airport keywords present (airport, DFW, IAH, HOU, AUS, SAT, DAL, Bush, Intercontinental, Hobby, Midway)

Category-specific structured_data — extract all fields you can, null for anything not mentioned:

category "rides":
  structured_data: { "has_luggage": boolean | null }
  has_luggage: true if luggage/bags/suitcase mentioned; false if "no luggage"; null if not mentioned

category "moving":
  structured_data: {
    "move_type": "move_in" | "move_out" | "furniture" | "other" | null,
    "helpers_needed": number | null,
    "access_type": "stairs" | "elevator" | "ground" | null,
    "has_heavy_items": boolean | null,
    "truck_needed": boolean | null,
    "estimated_duration": string | null
  }
  move_type: "move_in" if moving into dorm/apt; "move_out" if moving out; "furniture" if just moving items; "other" otherwise
  helpers_needed: number of helpers explicitly stated (e.g. "2 people" → 2); null if not stated
  access_type: "stairs" if stairs mentioned; "elevator" if elevator mentioned; "ground" if ground floor; null if not mentioned
  has_heavy_items: true if furniture/heavy boxes/appliances mentioned; null if not stated
  truck_needed: true if truck/van/vehicle mentioned; null if not stated

category "peer_help":
  structured_data: {
    "subject": string | null,
    "is_virtual": true | false | "either" | null,
    "session_type": "one_time" | "recurring" | null,
    "help_type": "homework" | "exam_prep" | "concept" | "coding" | "proofreading" | "study_session" | null
  }
  subject: specific course or subject name if mentioned (e.g. "CHEM 101", "calculus", "Python"); null if not clear
  is_virtual: true if "online"/"virtual"/"Zoom"; false if "in person"/"in-person"/"meet up"; "either" if "either works"/"flexible"; null if not stated
  session_type: "recurring" if "weekly"/"every week"/"ongoing"; "one_time" otherwise
  help_type: "homework" if assignment/problem set help; "exam_prep" if test/exam prep/review; "concept" if explaining a topic/concept; "coding" if programming/code help; "proofreading" if editing/proofreading writing; "study_session" if studying together/study group; null if not clear

category "errands":
  structured_data: {
    "errand_type": "grocery" | "food_pickup" | "package" | "delivery" | "other" | null,
    "store_or_place": string | null,
    "task_details": string | null,
    "reimbursement_type": "paid" | "reimburse" | "free" | null
  }
  errand_type: classify from context (grocery run → "grocery"; Uber Eats/food pickup → "food_pickup"; package/mail → "package"; drop off/deliver → "delivery")
  store_or_place: store name or location if mentioned (e.g. "HEB", "Walmart", "post office")
  task_details: specific items to pick up or tasks to perform if mentioned (e.g. "milk, eggs, and bread", "pick up my package from the mailroom", "drop off charger at Zachry 403"); null if not mentioned
  reimbursement_type: "paid" if they offer to pay helper; "reimburse" if helper fronts money and gets reimbursed; "free" if favor; null if not clear

category "borrow":
  structured_data: {
    "item": string | null,
    "borrow_duration": string | null,
    "replacement_responsibility": boolean | null
  }
  item: specific item if mentioned (e.g. "drill", "textbook", "calculator"); null if not clear
  borrow_duration: duration if stated (e.g. "2 days", "this weekend", "a week"); null if not stated
  replacement_responsibility: true if they say they'll replace/pay if broken; null if not stated

missing_fields per category (list field names NOT extracted):
- rides: from ["origin_city","destination_city","scheduled_time"] — only those that are null
- moving: from ["helpers_needed","location","access_type"] — only those that are null/not stated
- peer_help: from ["subject","is_virtual","scheduled_time"] — only those that are null
- errands: from ["location","reimbursement_type","task_details"] — only those that are null
- borrow: from ["item","borrow_duration"] — only those that are null

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
