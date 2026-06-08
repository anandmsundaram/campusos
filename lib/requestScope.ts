export const SCOPE_BLOCKED_MESSAGE =
  'CampusOS is for practical campus help like rides, pickups, errands, moving, and quick paid favors. This request is outside the current beta scope.'

export type ScopeCheckResult = { allowed: true } | { allowed: false; reason: string }

// Practical-service keywords that always override soft blocks (dating, social)
const PRACTICAL_RE =
  /\b(ride|rides|errand|errands|pick\s*up|pickup|grocery|groceries|moving|carry|deliver|delivery|borrow)\b/i

// Academic cheating patterns
const ACADEMIC_CHEAT_RE =
  /\b(?:do|write|complete|finish|submit)\s+(?:my|the)\s+(?:homework|assignment|essay|paper|exam|test|quiz)\b|\bcheat\s+on\s+(?:my|the)\b|\btake\s+my\s+(?:exam|test|quiz|midterm|final)\b|\b(?:homework|exam|test|assignment)\s+answers?\b/i

// Acquisition verbs
const ACQUIRE_RE =
  /\b(?:buy|get|purchase|pick\s+up|grab|order|score|procure)\b/i

// Illegal / regulated items
const ILLEGAL_ITEM_RE =
  /\b(?:alcohol|beer|wine|vodka|liquor|spirits|booze|whiskey|tequila|rum|drugs|weed|marijuana|cannabis|vape|vapes|vaping|cigarettes?|tobacco|cocaine|heroin|meth|weapon|weapons|firearm|firearms|ammunition|ammo)\b/i

// Dating / social patterns (checked only when no practical service keyword)
const DATING_RE =
  /\bget\s+a\s+date\b|\bfind\s+(?:me\s+)?(?:a\s+)?date\b|\bbe\s+(?:my|a)\s+date\b|\bdating\s+advice\b|\b(?:relationship|love|romantic)\s+advice\b|\bhook\s*up\b|\bfind\s+(?:me\s+)?a\s+(?:girl|boy)(?:friend)?\b/i

export function checkRequestScope(text: string): ScopeCheckResult {
  // Academic cheating — hard block regardless of other keywords
  if (ACADEMIC_CHEAT_RE.test(text)) {
    return { allowed: false, reason: SCOPE_BLOCKED_MESSAGE }
  }

  // Illegal purchases — hard block regardless of other keywords
  if (ACQUIRE_RE.test(text) && ILLEGAL_ITEM_RE.test(text)) {
    return { allowed: false, reason: SCOPE_BLOCKED_MESSAGE }
  }

  // Practical-service keyword: always allow
  if (PRACTICAL_RE.test(text)) {
    return { allowed: true }
  }

  // Dating / social without a practical service anchor
  if (DATING_RE.test(text)) {
    return { allowed: false, reason: SCOPE_BLOCKED_MESSAGE }
  }

  return { allowed: true }
}
