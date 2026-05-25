/**
 * Guided tour helpers.
 *
 * Storage strategy (v1 beta):
 *   Tour state is stored in auth.users.raw_user_meta_data under the key
 *   "tour_state" (via supabase.auth.updateUser), consistent with the
 *   terms_accepted and qa_bypass patterns.
 *   Migration 029 defines the long-term canonical DB table.
 */

export const TOUR_VERSION = 'campusos-first-login-tour-v1'

export interface TourStep {
  title: string
  body: string
  examples?: string[]
  note?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'CampusOS helps students coordinate real campus help',
    body: 'Request help, offer help, earn money, and build trust with other students.',
    examples: ['Rides', 'Pickups', 'Moving help', 'Peer help', 'Borrowing', 'Meal & social coordination'],
  },
  {
    title: 'Rides',
    body: 'Ask for a ride or offer available seats when you are already going somewhere.',
    examples: ['"Need a ride to Target"', '"Driving to Walmart at 5, 2 open seats"'],
    note: 'CampusOS coordinates peers. It is not a transportation provider.',
  },
  {
    title: 'Pickups & errands',
    body: 'Use this for simple pickup/dropoff help, like prepaid food orders, packages, or small already-paid items.',
    examples: ['"Pick up my prepaid Chick-fil-A order"', '"Can someone pick up my package?"'],
  },
  {
    title: 'Moving help',
    body: 'Find students who can help move boxes, small furniture, or dorm/apartment items.',
    examples: ['"Need 2 helpers Saturday 2–4 PM"', '"Truck helpful"'],
  },
  {
    title: 'Peer help',
    body: 'Ask for help with a class, homework concept, tutoring-style support, or study help.',
    examples: ['"Need help with calc tonight"', '"CS homework help online"'],
  },
  {
    title: 'Borrow',
    body: 'Ask to borrow common campus items and agree on return expectations.',
    examples: ['Calculator', 'Charger', 'Umbrella', 'Lab item if appropriate'],
  },
  {
    title: 'Meal & Social',
    body: 'Find people to go with you for food or a casual campus plan.',
    examples: ['"Anyone for Thai restaurant?"', '"Anyone interested in Mexican food?"'],
    note: 'Cost plans can be everyone pays for themselves, split bill, or discuss in chat.',
  },
  {
    title: 'Clear details before posting',
    body: 'CampusOS asks for the important details before anything goes live: where, when, payment/cost plan, and final confirmation.',
    note: 'This helps avoid confusing posts and mismatched expectations.',
  },
  {
    title: 'Trust and safety',
    body: 'Use ratings, activity signals, reports, and clear terms to coordinate safely.',
    note: 'Payments are external during beta. CampusOS is a peer-to-peer coordination platform — not an employer, transportation provider, delivery provider, or payment processor.',
  },
  {
    title: 'You are ready',
    body: 'Post a request, browse open requests, or offer help when you are available.',
  },
]

export interface TourState {
  tourVersion: string
  completedAt: string | null
  skippedAt: string | null
  lastSeenStep: number | null
}

type TourReadClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { user_metadata?: Record<string, unknown> } | null }
    }>
  }
}

type TourWriteClient = {
  auth: {
    updateUser: (opts: {
      data: Record<string, unknown>
    }) => Promise<{ error: { message: string } | null }>
  }
}

/** Returns true if the user has completed or skipped this tour version. */
export function isTourDone(state: TourState | null): boolean {
  if (!state) return false
  return state.completedAt !== null || state.skippedAt !== null
}

/** Read tour state for the current tour version from user_metadata. */
export async function getTourState(supabase: TourReadClient): Promise<TourState | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const ts = meta.tour_state as Record<string, unknown> | null | undefined

  if (!ts || ts.tour_version !== TOUR_VERSION) return null

  return {
    tourVersion:   ts.tour_version as string,
    completedAt:   (ts.completed_at  as string)  ?? null,
    skippedAt:     (ts.skipped_at    as string)  ?? null,
    lastSeenStep:  (ts.last_seen_step as number) ?? null,
  }
}

/** Mark the tour as completed in user_metadata. */
export async function storeTourCompleted(supabase: TourWriteClient): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({
    data: {
      tour_state: {
        tour_version:   TOUR_VERSION,
        completed_at:   new Date().toISOString(),
        skipped_at:     null,
        last_seen_step: TOUR_STEPS.length,
      },
    },
  })
  return { error: error?.message ?? null }
}

/** Mark the tour as skipped at the given 1-based step in user_metadata. */
export async function storeTourSkipped(
  supabase: TourWriteClient,
  step: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({
    data: {
      tour_state: {
        tour_version:   TOUR_VERSION,
        completed_at:   null,
        skipped_at:     new Date().toISOString(),
        last_seen_step: step,
      },
    },
  })
  return { error: error?.message ?? null }
}
