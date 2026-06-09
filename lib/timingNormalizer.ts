// Converts UI TimeSlotState to durable, date-resolved storage values.
// Pure functions — no React, no external dependencies.

export interface TimeSlotState {
  dateMode: 'today' | 'tomorrow' | 'weekend' | 'later' | null
  date: string | null           // 'YYYY-MM-DD' for dateMode='later'
  weekendDay: 'saturday' | 'sunday' | null
  timeMode: 'specific' | 'range' | 'flexible' | null
  startHour: string
  startMinute: string
  startAmPm: 'AM' | 'PM' | ''
  endHour: string
  endMinute: string
  endAmPm: 'AM' | 'PM' | ''
}

export interface ResolvedTiming {
  scheduled_time: string | null   // ISO 8601 UTC
  flexible_time: boolean
  time_window_end: string | null  // ISO 8601 UTC, for range selections
}

function to24Hour(h: string, m: string, ap: string): [number, number] {
  let hour = parseInt(h, 10)
  const min = parseInt(m, 10)
  if (ap === 'PM' && hour !== 12) hour += 12
  if (ap === 'AM' && hour === 12) hour = 0
  return [hour, min]
}

function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dy}`
}

function nextWeekday(targetDay: number /* 0=Sun,6=Sat */): string {
  const now = new Date()
  const today = now.getDay()
  let diff = targetDay - today
  if (diff <= 0) diff += 7
  return localDateStr(diff)
}

function resolveDateStr(ts: TimeSlotState): string | null {
  if (ts.dateMode === 'today') return localDateStr(0)
  if (ts.dateMode === 'tomorrow') return localDateStr(1)
  if (ts.dateMode === 'weekend') {
    if (ts.weekendDay === 'saturday') return nextWeekday(6)
    if (ts.weekendDay === 'sunday') return nextWeekday(0)
    return null
  }
  if (ts.dateMode === 'later') return ts.date
  return null
}

function makeIso(dateStr: string, hour: number, minute: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d, hour, minute, 0, 0).toISOString()
}

/** Convert UI time slot state to durable storage values. */
export function resolveTimeSlot(ts: TimeSlotState): ResolvedTiming {
  const dateStr = resolveDateStr(ts)
  if (!dateStr || !ts.timeMode) {
    return { scheduled_time: null, flexible_time: false, time_window_end: null }
  }

  if (ts.timeMode === 'flexible') {
    return { scheduled_time: makeIso(dateStr, 12, 0), flexible_time: true, time_window_end: null }
  }

  if (ts.timeMode === 'specific' && ts.startHour && ts.startMinute && ts.startAmPm) {
    const [h, m] = to24Hour(ts.startHour, ts.startMinute, ts.startAmPm)
    return { scheduled_time: makeIso(dateStr, h, m), flexible_time: false, time_window_end: null }
  }

  if (ts.timeMode === 'range' && ts.startHour && ts.endHour) {
    const [sh, sm] = to24Hour(ts.startHour, ts.startMinute, ts.startAmPm)
    const [eh, em] = to24Hour(ts.endHour, ts.endMinute, ts.endAmPm)
    return {
      scheduled_time: makeIso(dateStr, sh, sm),
      flexible_time: false,
      time_window_end: makeIso(dateStr, eh, em),
    }
  }

  return { scheduled_time: null, flexible_time: false, time_window_end: null }
}

function formatDateLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmt(h: string, m: string, ap: string): string {
  return `${h}:${m} ${ap}`
}

/** Human-readable label using resolved absolute dates (not "Today" / "Tomorrow"). */
export function buildAbsoluteDateLabel(ts: TimeSlotState): string {
  const dateStr = resolveDateStr(ts)
  if (!dateStr) return ''
  const label = formatDateLabel(dateStr)
  if (ts.timeMode === 'flexible' || !ts.timeMode) return `${label}, flexible time`
  if (ts.timeMode === 'specific' && ts.startHour && ts.startMinute && ts.startAmPm) {
    return `${label} at ${fmt(ts.startHour, ts.startMinute, ts.startAmPm)}`
  }
  if (ts.timeMode === 'range' && ts.startHour && ts.endHour) {
    return `${label} between ${fmt(ts.startHour, ts.startMinute, ts.startAmPm)} – ${fmt(ts.endHour, ts.endMinute, ts.endAmPm)}`
  }
  return label
}

/**
 * For old records missing scheduled_time, infer approximate date from
 * deadline_text relative to created_at.
 */
export function inferDateFromDeadlineText(text: string, createdAt: string): Date | null {
  const base = new Date(createdAt)
  if (isNaN(base.getTime())) return null
  const lower = text.toLowerCase()
  const y = base.getFullYear(), mo = base.getMonth(), d = base.getDate()
  if (lower.startsWith('today')) return new Date(y, mo, d, 12, 0, 0)
  if (lower.startsWith('tomorrow')) return new Date(y, mo, d + 1, 12, 0, 0)
  if (lower.startsWith('saturday')) {
    const diff = (6 - base.getDay() + 7) % 7 || 7
    return new Date(y, mo, d + diff, 12, 0, 0)
  }
  if (lower.startsWith('sunday')) {
    const diff = (7 - base.getDay()) % 7 || 7
    return new Date(y, mo, d + diff, 12, 0, 0)
  }
  return null
}
