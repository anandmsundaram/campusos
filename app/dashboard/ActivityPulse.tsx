// Server component — rendered once per page load from pre-fetched counts.
// No client-side JS needed; all stats come from the dashboard query.

interface Props {
  openCount: number
  completedThisWeek: number
  helpedToday: number
}

export default function ActivityPulse({ openCount, completedThisWeek, helpedToday }: Props) {
  // Stay quiet on a completely cold campus so we don't show zeros
  if (completedThisWeek === 0 && helpedToday === 0 && openCount === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {completedThisWeek > 0 && (
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-xs font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400 animate-pulse" />
          {completedThisWeek} completed this week
        </span>
      )}
      {helpedToday > 0 && (
        <span className="flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/[0.05] px-3 py-1 text-xs font-medium text-blue-400">
          {helpedToday} student{helpedToday !== 1 ? 's' : ''} helped today
        </span>
      )}
      {openCount > 0 && (
        <span className="text-xs text-slate-600 pl-1">
          {openCount} open right now
        </span>
      )}
    </div>
  )
}
