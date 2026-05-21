import Link from 'next/link'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SCENARIOS = [
  { emoji: '🚗', label: 'Rides', text: 'Need a ride to the airport at 5 AM?' },
  { emoji: '📦', label: 'Moving Help', text: 'Moving dorms and need an extra pair of hands?' },
  { emoji: '📚', label: 'Tutoring', text: 'Stuck on problem sets at midnight?' },
  { emoji: '🛒', label: 'Errands', text: 'Need someone to grab groceries or pick something up?' },
  { emoji: '🔌', label: 'Borrowing', text: 'Need a calculator, charger, or textbook for a day?' },
]

const STEPS = [
  {
    n: '1',
    title: 'Post what you need',
    body: 'Describe your request in plain English. Rides, help moving, tutoring, errands, borrowing — anything campus-related.',
  },
  {
    n: '2',
    title: 'Students nearby respond',
    body: 'Other verified students see your request and offer to help. Review their profiles, ratings, and proposed price.',
  },
  {
    n: '3',
    title: 'Coordinate and complete',
    body: 'Accept an offer, coordinate over chat, and pay directly (Venmo, Zelle, cash). Rate your experience when done.',
  },
]

const TRUST = [
  { emoji: '🎓', label: '.edu verified', body: 'Only students with a valid university email can join. No strangers.' },
  { emoji: '⭐', label: 'Rated profiles', body: 'Every student builds a reputation through completed requests and reviews.' },
  { emoji: '🔒', label: 'Campus-focused', body: 'Built for the rhythms of student life — move-in, finals, late nights, airport runs.' },
  { emoji: '💬', label: 'Real-time coordination', body: 'Chat directly once an offer is accepted. No third-party middleman.' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#060b17] text-white font-sans antialiased">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-[#1e2d4a]/60 bg-[#060b17]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-lg leading-none">⬡</span>
            <span className="font-semibold text-[15px] tracking-tight text-white">CampusOS</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.12), transparent)',
          }}
        />

        <div className="relative mx-auto max-w-4xl px-5 pt-20 pb-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.07] px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs font-medium text-blue-400">Students helping students in real time</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight text-white">
            The campus marketplace<br className="hidden sm:block" />
            <span className="text-blue-400"> for everything student</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-slate-400 leading-relaxed">
            Post a request. Get offers from verified students nearby.
            Rides, moving help, tutoring, errands, borrowing — coordinated and done.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-colors"
            >
              Get started — it&apos;s free
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto rounded-xl border border-[#1e2d4a] px-8 py-3.5 text-base font-medium text-slate-300 hover:border-white/20 hover:text-white transition-colors"
            >
              Log in
            </Link>
          </div>

          <p className="mt-4 text-xs text-slate-600">University email required. Free to join.</p>
        </div>
      </section>

      {/* ── Scenario cards ── */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-600 mb-6">
          What students use CampusOS for
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {SCENARIOS.map(s => (
            <div
              key={s.label}
              className="flex flex-col gap-2.5 rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-4 py-4 hover:border-blue-500/30 transition-colors"
            >
              <span className="text-2xl leading-none">{s.emoji}</span>
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">{s.label}</span>
              <p className="text-sm text-slate-400 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-[#1e2d4a] bg-[#0a0f1e]">
        <div className="mx-auto max-w-4xl px-5 py-20">
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-white mb-3">
            How CampusOS works
          </h2>
          <p className="text-center text-sm text-slate-500 mb-12">
            Three steps from stuck to sorted.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {STEPS.map(step => (
              <div key={step.n} className="flex flex-col gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/[0.07] text-base font-bold text-blue-400">
                  {step.n}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white mb-1.5">{step.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Payment note */}
          <div className="mt-12 rounded-xl border border-[#1e2d4a] bg-[#060b17] px-5 py-4 text-center">
            <p className="text-sm text-slate-500 leading-relaxed">
              💳 <span className="font-medium text-slate-400">Payments are handled directly between students</span>{' '}
              — Venmo, Zelle, cash, or whatever works. CampusOS coordinates; you pay each other.
            </p>
          </div>
        </div>
      </section>

      {/* ── Trust signals ── */}
      <section className="border-t border-[#1e2d4a]">
        <div className="mx-auto max-w-4xl px-5 py-20">
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-white mb-3">
            Built for trust on campus
          </h2>
          <p className="text-center text-sm text-slate-500 mb-12">
            Everyone on CampusOS is a real, verified student.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {TRUST.map(t => (
              <div
                key={t.label}
                className="flex items-start gap-4 rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-4"
              >
                <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{t.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-white mb-1">{t.label}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-[#1e2d4a] bg-[#0a0f1e]">
        <div className="mx-auto max-w-xl px-5 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Ready to post your first request?
          </h2>
          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            Join your campus community. Post a request in 30 seconds.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-colors"
          >
            Sign up with your .edu email
          </Link>
          <p className="mt-4 text-xs text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="text-slate-400 hover:text-white transition-colors underline underline-offset-2">
              Log in
            </Link>
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#1e2d4a] bg-[#060b17]">
        <div className="mx-auto max-w-5xl px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 leading-none">⬡</span>
            <span className="text-sm font-medium text-slate-500">CampusOS</span>
          </div>
          <p className="text-xs text-slate-600">Students helping students. University email required.</p>
        </div>
      </footer>
    </div>
  )
}
