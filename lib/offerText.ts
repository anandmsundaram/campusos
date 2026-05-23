// Centralized helpers for offer/counter/response text — role-aware, subflow-aware.
// Used by RequestFeed, offers/page, and any future marketplace components.

export type OfferSubflow =
  | 'ride_request'
  | 'food_pickup_request'
  | 'errand_request'
  | 'moving_request'
  | 'peer_help_request'
  | 'borrow_request'
  | 'meal_meetup_request'
  | 'unknown'

export type OfferEvent =
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_declined'
  | 'counter_sent'
  | 'counter_accepted'
  | 'counter_declined'

export function subflowFromCategory(
  category: string,
  errandType?: string | null,
): OfferSubflow {
  switch (category) {
    case 'rides': return 'ride_request'
    case 'meal_meetup': return 'meal_meetup_request'
    case 'moving': return 'moving_request'
    case 'peer_help': return 'peer_help_request'
    case 'borrow': return 'borrow_request'
    case 'errands':
      if (errandType === 'food_pickup' || errandType === 'food_delivery') return 'food_pickup_request'
      return 'errand_request'
    default: return 'unknown'
  }
}

// Placeholder text for the offer/response message textarea.
// For ride-specific cases (driverPostingSeats / passengerNeedsRide), the caller
// may override — this covers the non-ride default path.
export function getDefaultOfferMessage(subflow: OfferSubflow): string {
  switch (subflow) {
    case 'ride_request':          return "e.g. I have a car and can pick you up…"
    case 'food_pickup_request':   return "e.g. I can pick this up on my way…"
    case 'moving_request':        return "e.g. I have a truck and am free Saturday…"
    case 'peer_help_request':     return "e.g. I've taken this course and can meet up…"
    case 'borrow_request':        return "e.g. I have one you can borrow until Sunday…"
    case 'meal_meetup_request':   return "e.g. I'm free and would love to join…"
    default:                       return "e.g. I'm free this afternoon and can help…"
  }
}

export function getOfferNotificationMessage(
  event: OfferEvent,
  subflow: OfferSubflow,
  opts: { title?: string; amount?: number | null } = {},
): string {
  const { title, amount } = opts
  const t = title ? ` for "${title}"` : ''
  const a = amount != null ? ` — $${amount}` : ''

  switch (event) {
    case 'offer_received':
      if (subflow === 'ride_request')          return `Someone offered a ride${t}`
      if (subflow === 'meal_meetup_request')   return `Someone wants to join${t}`
      if (subflow === 'food_pickup_request')   return `Someone offered to pick this up${t}`
      if (subflow === 'moving_request')        return `New offer to help you move${t}`
      if (subflow === 'peer_help_request')     return `New offer to help you${t}`
      if (subflow === 'borrow_request')        return `Someone offered to lend${t}`
      return `You received a new offer${t}`

    case 'offer_accepted':
      if (subflow === 'ride_request')          return `Your ride offer was accepted${t}`
      if (subflow === 'meal_meetup_request')   return `Your request to join was accepted${t}`
      if (subflow === 'food_pickup_request')   return `Your pickup offer was accepted${t}`
      if (subflow === 'moving_request')        return `Your offer to help move was accepted${t}`
      if (subflow === 'peer_help_request')     return `Your offer to help was accepted${t}`
      if (subflow === 'borrow_request')        return `Your offer to lend was accepted${t}`
      return `Your offer was accepted${t}`

    case 'offer_declined':
      if (subflow === 'ride_request')          return `Your ride offer was declined${t}`
      if (subflow === 'meal_meetup_request')   return `Your request to join was declined${t}`
      return `Your offer was declined${t}`

    case 'counter_sent':
      if (subflow === 'ride_request')          return `Counter-offer received on your ride${t}${a}`
      return `Counter-offer received${t}${a}`

    case 'counter_accepted':
      if (subflow === 'meal_meetup_request')   return `Your response was accepted${t}`
      return `Your counter-offer was accepted${t}`

    case 'counter_declined':
      if (subflow === 'meal_meetup_request')   return `Your response was declined${t}`
      return `Your counter-offer was declined${t}`
  }
}

// Label shown in the helper's My Offers tab for the counter section.
// requestIsDriver: whether the request's is_driver field is true (i.e., the
// requester is the driver — used to differentiate ride counter sources).
export function getCounterLabel(
  subflow: OfferSubflow,
  requestIsDriver?: boolean | null,
): string {
  if (subflow === 'ride_request') {
    return requestIsDriver === true ? 'Counter from driver' : 'Counter from passenger'
  }
  if (subflow === 'meal_meetup_request') return 'Response from organizer'
  return 'Counter-offer from requester'
}

export function getStatusLabel(
  status: string,
  subflow: OfferSubflow,
  opts: { agreedPrice?: number | null; seats?: number } = {},
): string {
  const { agreedPrice, seats = 1 } = opts

  if (status === 'pending') {
    return subflow === 'meal_meetup_request' ? '● Pending response' : '● Pending'
  }
  if (status === 'countered') {
    if (subflow === 'ride_request')        return '↩ Counter from driver'
    if (subflow === 'meal_meetup_request') return '↩ Response received'
    return '↩ Counter received'
  }
  if (status === 'accepted') {
    if (subflow === 'meal_meetup_request') return '✓ Joined'
    const price = agreedPrice != null
      ? ` · ${seats > 1 ? `${seats}× ` : ''}$${agreedPrice}`
      : ''
    return `✓ Accepted${price}`
  }
  return subflow === 'meal_meetup_request' ? 'Not joining' : 'Declined'
}
