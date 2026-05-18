# CampusOS — Architecture & Build Log

> AI-powered campus coordination platform. Students post requests, helpers offer assistance, and Claude parses everything in natural language.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS v4 | 4.x |
| Database + Auth | Supabase | @supabase/ssr 0.10.3 |
| Realtime | Supabase Realtime (postgres_changes) | — |
| AI | Anthropic Claude (claude-haiku-4-5-20251001) | @anthropic-ai/sdk 0.96 |
| React | React 19 | 19.x |

**Next.js 16 breaking change:** middleware is exported as `proxy` (not `middleware`) from `proxy.ts`. The `cookies()` API from `next/headers` must be `await`ed.

---

## Repository Structure

```
campusos/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          # Email/password login
│   │   └── signup/page.tsx         # Signup with .edu enforcement + bypass list
│   ├── api/
│   │   ├── auth/callback/route.ts  # Supabase OAuth callback handler
│   │   ├── parse-request/route.ts  # Claude AI — natural language → structured JSON
│   │   └── match-rides/route.ts    # Ride matching engine (±3h window)
│   ├── dashboard/
│   │   ├── layout.tsx              # Auth guard + Sidebar wrapper (server)
│   │   ├── page.tsx                # Main dashboard (server — fetches requests)
│   │   ├── RequestInput.tsx        # AI input box + confirmation card (client)
│   │   ├── RequestFeed.tsx         # Tabbed feed + offer flow (client)
│   │   ├── Sidebar.tsx             # Nav sidebar + notification bell (client)
│   │   ├── messages/page.tsx       # Two-panel realtime messaging (client)
│   │   ├── offers/page.tsx         # My Offers — outgoing offer status (client)
│   │   ├── profile/page.tsx        # Profile edit + stats + reviews (client)
│   │   ├── requests/page.tsx       # My Requests — manage + complete + review (client)
│   │   └── rides/page.tsx          # Dedicated rides page — route-grouped (client)
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Landing → redirect to /dashboard
├── lib/
│   └── supabase/
│       ├── client.ts               # createBrowserClient (client components)
│       └── server.ts               # createServerClient with cookie adapter (server)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql  # Core tables, enums, RLS, trigger
│       ├── 002_add_counter_budget.sql
│       ├── 003_enable_realtime.sql
│       ├── 004_notifications.sql   # notifications table + RLS
│       └── 005_ride_fields.sql     # Ride-specific columns on requests
└── proxy.ts                        # Next.js 16 middleware (Supabase session refresh)
```

---

## Database Schema

### Core Tables

**`profiles`** — one row per auth user, auto-created by trigger
```
id                  uuid (PK, FK → auth.users)
name                text
university          text
major               text
year                text
rating              decimal(3,2)  default 5.0
completed_tasks     int           default 0
verification_status enum(pending, verified, rejected)
avatar_url          text
created_at          timestamptz
```

**`requests`** — a student's posted need
```
id              uuid (PK)
requester_id    uuid (FK → profiles)
category        enum(rides, moving, peer_help, errands, borrow)
title           text
description     text
location        text
budget          decimal(10,2)
urgency         enum(low, medium, high)
status          enum(open, matched, completed, cancelled)
scheduled_time  timestamptz

-- Ride-specific (migration 005)
origin_city       text
destination_city  text
is_driver         boolean       -- true=offering, false=looking
available_seats   integer
is_round_trip     boolean       default false
return_date       timestamptz
flexible_time     boolean       default false
```

**`request_offers`** — a helper's bid on a request
```
id              uuid (PK)
request_id      uuid (FK → requests)
helper_id       uuid (FK → profiles)
message         text
counter_budget  decimal(10,2)   -- added migration 002
status          enum(pending, accepted, rejected)
created_at      timestamptz
UNIQUE (request_id, helper_id)
```

**`messages`** — DMs between requester and helper
```
id          uuid (PK)
sender_id   uuid (FK → profiles)
receiver_id uuid (FK → profiles)
request_id  uuid (FK → requests, nullable)
content     text
created_at  timestamptz
CHECK (sender_id <> receiver_id)
```

**`reviews`** — post-completion ratings
```
id               uuid (PK)
reviewer_id      uuid (FK → profiles)
reviewed_user_id uuid (FK → profiles)
request_id       uuid (FK → requests)
rating           int (1–5)
review_text      text
created_at       timestamptz
UNIQUE (reviewer_id, request_id)
```

**`notifications`** — in-app notification feed (migration 004)
```
id                  uuid (PK)
user_id             uuid (FK → profiles)
type                text  -- offer_received | offer_accepted | offer_rejected | new_message | task_completed
message             text
read                boolean default false
related_request_id  uuid (FK → requests, nullable)
created_at          timestamptz
```

### RLS Summary

| Table | Read | Write |
|---|---|---|
| profiles | Any authenticated user | Owner only (trigger handles insert) |
| requests | Any authenticated user | Requester only |
| request_offers | Helper or requester of that request | Helper inserts, either party updates |
| messages | Sender or receiver | Sender only |
| reviews | Any authenticated user | Reviewer only, no edits |
| notifications | Owner only | Any authenticated user (MVP — client-side inserts) |

### Trigger

`handle_new_user()` — fires `AFTER INSERT ON auth.users`, auto-creates a `profiles` row from signup metadata.

### Realtime

Migration 003 adds `requests`, `request_offers`, `messages` to `supabase_realtime` publication. Migration 004 adds `notifications`. Used for:
- Live message delivery in the two-panel chat
- Notification bell badge increment without polling

---

## Authentication

- Email + password via Supabase Auth
- `.edu` email enforcement on signup
- **Bypass list** (non-.edu accounts allowed): `anandmsundaram@gmail.com`, `campusosapp@gmail.com`, `valsgum@gmail.com`
- Profile metadata (name, university, major, year) collected at signup and written via the DB trigger
- `proxy.ts` refreshes the session token on every request via the Supabase SSR middleware pattern

---

## AI Features

### `/api/parse-request` (POST)

Takes a free-text student request and returns structured JSON using Claude Haiku.

**Input:**
```json
{ "text": "need a ride to DFW Friday 9am", "source": "whatsapp" }
```

**Output schema:**
```json
{
  "category": "rides",
  "title": "Ride to DFW Friday 9am",
  "location": null,
  "scheduled_time": "2026-05-22T09:00:00",
  "urgency": "medium",
  "budget": null,
  "helper_requirements": null,
  "missing_fields": [],
  "origin_city": "UTD campus",
  "destination_city": "DFW Airport",
  "is_driver": false,
  "available_seats": null,
  "is_round_trip": false,
  "return_date": null,
  "flexible_time": false
}
```

- `source: 'whatsapp'` appends a system prompt suffix instructing Claude to handle informal/group-chat language
- JSON fences stripped before `JSON.parse` to handle model formatting variance
- Model: `claude-haiku-4-5-20251001` (fast + cheap for parsing)

### `/api/match-rides` (GET)

Ride-matching engine. Finds open ride posts on the same route within ±3 hours.

**Params:** `?origin_city=UTD&destination_city=DFW&scheduled_time=2026-05-22T09:00:00`

**Sort order:** time proximity → profile rating → price (ascending)

Returns up to 20 matches, excluding the current user's own posts.

---

## Feature Inventory

### Dashboard (`/dashboard`)

Server component fetches three parallel datasets:
1. All open requests (feed) — with ride fields
2. Current user's own requests — all statuses, with nested pending offers + helper profiles
3. Current user's sent offers — with nested request + requester profile

Passes data to `RequestInput` and `RequestFeed` client components.

**Stats bar:** live counts of active requests, campus members, matched tasks.

### Request Input (`RequestInput.tsx`)

- Typewriter placeholder animation cycling through 4 example prompts
- Category quick-fill pills (Rides, Moving Help, Peer Help, Errands, Borrow)
- AI parse on submit → confirmation card → Supabase insert
- **Confirmation card shows ride-specific fields:** origin → destination route, driver/passenger badge, seat count, round trip indicator, flexible time
- **WhatsApp import button** opens `WhatsAppImportModal` — paste text, parses with `source: 'whatsapp'`, shows same confirmation card

### Request Feed (`RequestFeed.tsx`)

Three tabs:
- **All Open** — community requests, filterable by category + urgency + sort
- **My Requests** — user's own requests across all statuses, with inline accept/decline for pending offers
- **My Offers** — outgoing offers with status badges

**Rides quick filter:** pill button that toggles `catFilter` to `rides`

**Ride card enhancements:**
- Left accent bar: blue for drivers, purple for passengers (vs. category color for other types)
- Origin → destination route display replaces generic location
- Driver/Passenger badge, seat count badge, round trip tag

**Offer flow (I can help):**
- Modal to submit offer with optional message + counter-budget
- Inline accept/decline rows on My Requests tab (no modal needed)
- Notification inserted to the counterparty on every action

### Sidebar (`Sidebar.tsx`)

Desktop (240px fixed left) + mobile bottom nav.

Nav links: Dashboard → **Rides** → My Requests → My Offers → Messages → Profile

**Notification Bell:**
- Fetches unread count on mount
- Supabase Realtime subscription for `INSERT` on notifications filtered by `user_id`
- Badge shows count (max display: 9+)
- Dropdown on click: loads 20 most recent notifications, marks all read on open
- Notification type icons: 🤝 offer_received, ✅ offer_accepted, ❌ offer_rejected, 💬 new_message, 🎉 task_completed

### Messages (`/dashboard/messages`)

Two-panel layout:
- Left panel: conversation threads (unique contacts from messages table)
- Right panel: full message thread with selected contact
- Supabase Realtime subscription for new messages in open thread
- Auto-scroll to latest message
- Textarea auto-resize on input, reset on send
- `new_message` notification inserted to receiver on every send
- Empty state: "Accept an offer to start chatting with your helper"

### My Requests (`/dashboard/requests`)

- Lists all user requests grouped by status (open / matched / completed / cancelled)
- **Cancel** action: sets status to `cancelled`
- **Complete** action: sets status to `completed`, sends `task_completed` notification to helper, triggers **Review Modal**
- **Review Modal:** 5-star click UI with quality labels (Poor / Fair / Good / Great / Excellent), optional text, inserts into `reviews` table, recalculates helper avg rating, increments `completed_tasks`. Handles duplicate reviews (error code `23505`).

### My Offers (`/dashboard/offers`)

Lists outgoing offers with status (Pending / Accepted / Declined). Shows request details, requester info, the offer message, and counter-budget if submitted.

### Profile (`/dashboard/profile`)

- Avatar with initials + verified badge (when `verification_status = 'verified'`)
- 4 stat cards: Requests posted, Tasks completed, Average rating, Reviews received
- Edit mode toggle (inline form, no separate page): name, university, major, year
- Reviews section: fetches reviews received with reviewer profile lookup (separate query to avoid FK disambiguation)

### Rides (`/dashboard/rides`)

Dedicated rides page with:
- **Two sub-tabs:** Looking for Ride (is_driver ≠ true) | Offering a Ride (is_driver = true)
- **Route-grouped feed:** cards grouped under `origin → destination` headers
- **Smart match banner:** on "Offering a Ride" tab, calls `/api/match-rides` for each of the user's passenger requests and shows "We found X drivers going your way!"
- **WhatsApp import button** — same modal flow as dashboard
- **Offer flow:** "Request seat" (for driver posts) or "Offer ride" (for passenger posts), one-click with notification to poster
- Left accent: blue for drivers, purple for passengers

---

## Data Flow — Posting a Request

```
User types text
  → RequestInput.handleSubmit()
  → POST /api/parse-request  { text, source? }
  → Claude Haiku → structured JSON
  → Confirmation card shown (with ride fields if category=rides)
  → User clicks "Confirm & post"
  → supabase.from('requests').insert({ ...all fields })
  → router.refresh() → server component re-fetches → feed updates
```

## Data Flow — Offer → Accept → Review

```
Helper clicks "I can help"
  → request_offers.insert({ status: 'pending' })
  → notifications.insert({ type: 'offer_received' → requester })

Requester accepts (inline card or modal)
  → request_offers.update({ status: 'accepted' })
  → requests.update({ status: 'matched' })
  → notifications.insert({ type: 'offer_accepted' → helper })

Requester marks Complete
  → requests.update({ status: 'completed' })
  → notifications.insert({ type: 'task_completed' → helper })
  → Review modal opens

Requester submits review
  → reviews.insert({ rating, review_text })
  → profiles.update({ rating: new_avg, completed_tasks: +1 })  [on helper]
```

## Data Flow — Realtime Notifications

```
Any client action inserts a row into notifications
  → Supabase broadcasts postgres_changes INSERT event
  → NotificationBell channel subscriber fires
  → setUnreadCount(prev => prev + 1)   ← badge increments instantly
```

---

## Design System

- **Color palette:** dark navy (`#0a0f1e` bg, `#0d1526` cards, `#060b17` sidebar, `#1e2d4a` borders)
- **Accent:** blue-500 primary, emerald-500 success, red-500 error, yellow-400 warning
- **Category colors:** Rides=blue, Moving=orange, Peer Help=green, Errands=purple, Borrow=pink
- **Ride role colors:** Driver=blue, Passenger=purple
- **Typography:** system font stack, `text-xs/sm/[15px]` hierarchy
- **Cards:** `rounded-xl border border-[#1e2d4a] bg-[#0d1526]` with 3px left accent bar per category
- **Tailwind v4:** uses `@import "tailwindcss"` + `@theme inline` (not `tailwind.config.js`)

---

## Migrations Changelog

| File | Description |
|---|---|
| `001_initial_schema.sql` | profiles, requests, request_offers, messages, reviews tables; all enums; RLS policies; `handle_new_user` trigger; indexes |
| `002_add_counter_budget.sql` | `counter_budget decimal(10,2)` column on `request_offers` |
| `003_enable_realtime.sql` | Adds requests, request_offers, messages to `supabase_realtime` publication |
| `004_notifications.sql` | notifications table; permissive insert RLS (any auth user can notify another); adds to realtime publication |
| `005_ride_fields.sql` | origin_city, destination_city, is_driver, available_seats, is_round_trip, return_date, flexible_time on requests |

---

## Known Constraints & MVP Tradeoffs

- **Notification inserts are client-side** — no Postgres triggers. The permissive `with check (true)` insert policy lets any authenticated user write a notification for any other user. Acceptable for MVP; should be replaced with a Postgres trigger or Edge Function before scaling.
- **No image uploads** — avatar is initials only (uses name initial + gradient).
- **No push notifications** — bell badge only updates when the page is open (Realtime WebSocket).
- **Review deduplication** — handled by unique constraint `(reviewer_id, request_id)` with error code `23505` caught on the client.
- **Ride matching is case-insensitive ILIKE** — fuzzy but not semantic. Could upgrade to pgvector embeddings for "UTD" ↔ "University of Texas at Dallas" matching.
- **No email .edu verification** — only suffix check + bypass list. Real verification would require email link or SSO.
