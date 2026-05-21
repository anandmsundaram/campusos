// Server component — pure date logic, no DB needed.
// Shows a single relevant campus-life prompt based on the academic calendar.
// Returns null outside of tracked periods so it never feels forced.

interface BannerContext {
  emoji: string
  title: string
  body: string
  colorClass: string
}

function getCurrentContext(): BannerContext | null {
  const now = new Date()
  const month = now.getMonth() + 1 // 1–12
  const day = now.getDate()

  // Spring finals (late April + early May)
  if ((month === 4 && day >= 22) || (month === 5 && day <= 12)) {
    return {
      emoji: '📚',
      title: 'Finals season is here',
      body: 'Post a tutoring request or offer to help a classmate review — a lot of students are looking right now.',
      colorClass: 'border-green-500/20 bg-green-500/[0.04] text-green-400',
    }
  }

  // Thanksgiving travel window (Nov 18–27) — must come before fall finals
  if (month === 11 && day >= 18 && day <= 27) {
    return {
      emoji: '✈️',
      title: 'Heading home for Thanksgiving?',
      body: 'Coordinate rides with students going the same direction — split the cost, skip the airport stress.',
      colorClass: 'border-blue-500/20 bg-blue-500/[0.04] text-blue-400',
    }
  }

  // Fall finals (post-Thanksgiving November + early-mid December)
  if ((month === 11 && day >= 28) || (month === 12 && day <= 16)) {
    return {
      emoji: '📚',
      title: 'Finals are coming up',
      body: 'Find a peer tutor or share what you know — there\'s always someone who could use the help before exams.',
      colorClass: 'border-green-500/20 bg-green-500/[0.04] text-green-400',
    }
  }

  // Spring break travel (mid-March)
  if (month === 3 && day >= 7 && day <= 23) {
    return {
      emoji: '✈️',
      title: 'Spring break travel season',
      body: 'Need an airport run or a seat in someone\'s car? Post a ride request and find a match.',
      colorClass: 'border-blue-500/20 bg-blue-500/[0.04] text-blue-400',
    }
  }

  // Fall move-in (mid-to-late August)
  if (month === 8 && day >= 10 && day <= 28) {
    return {
      emoji: '📦',
      title: 'Move-in weekend',
      body: 'Moving into a new place? Students nearby can help with boxes, furniture, and hauling — earn or get help.',
      colorClass: 'border-orange-500/20 bg-orange-500/[0.04] text-orange-400',
    }
  }

  // Spring move-in (early-mid January)
  if (month === 1 && day >= 8 && day <= 22) {
    return {
      emoji: '📦',
      title: 'New semester, fresh start',
      body: 'Moving to a new place or just need a hand settling in? Post a request — other students are around.',
      colorClass: 'border-orange-500/20 bg-orange-500/[0.04] text-orange-400',
    }
  }

  // First week of fall semester (late August)
  if (month === 8 && day >= 25 && day <= 31) {
    return {
      emoji: '🎓',
      title: 'Welcome back to campus',
      body: 'CampusOS connects you with students for rides, tutoring, errands, and more. Post your first request.',
      colorClass: 'border-slate-500/20 bg-white/[0.02] text-slate-400',
    }
  }

  // First week of spring semester (mid-January)
  if (month === 1 && day >= 13 && day <= 20) {
    return {
      emoji: '🎓',
      title: 'New semester on campus',
      body: 'Need a ride, a tutor, or a hand with something? Other verified students are ready to help.',
      colorClass: 'border-slate-500/20 bg-white/[0.02] text-slate-400',
    }
  }

  return null
}

export default function ContextualBanner() {
  const ctx = getCurrentContext()
  if (!ctx) return null

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 mb-3 ${ctx.colorClass}`}>
      <span className="text-base leading-none mt-0.5 flex-shrink-0">{ctx.emoji}</span>
      <div>
        <p className="text-xs font-semibold">{ctx.title}</p>
        <p className="text-[11px] leading-relaxed opacity-70 mt-0.5">{ctx.body}</p>
      </div>
    </div>
  )
}
