import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PageTracker from '@/app/components/PageTracker'
import PWAInstallCTA from '@/app/components/PWAInstallCTA'

// ─── Data ─────────────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    n: '1',
    emoji: '✍️',
    title: 'Post what you need',
    body: 'Type your request in plain English. Rides, moving help, food runs, errands — anything practical on campus.',
  },
  {
    n: '2',
    emoji: '🙋',
    title: 'Get offers from students nearby',
    body: 'Verified students on your campus see your post and offer to help — with a price, counter, or just a "I got you."',
  },
  {
    n: '3',
    emoji: '✅',
    title: 'Accept the best fit',
    body: 'Review offers, pick the one that works, and confirm. Chat directly to coordinate the details.',
  },
  {
    n: '4',
    emoji: '💸',
    title: 'Meet, complete, and pay directly',
    body: 'Handle payment however works — Venmo, Zelle, cash. CampusOS connects you; you pay each other.',
  },
]

const CATEGORIES = [
  { emoji: '🚗', label: 'Rides', body: 'Airport runs, downtown trips, late-night campus pickups.' },
  { emoji: '🍕', label: 'Food & grocery runs', body: 'Pick up a food order, grab groceries, or swing by a store.' },
  { emoji: '📦', label: 'Moving & carrying', body: 'Dorm moves, furniture hauls, carrying boxes across campus.' },
  { emoji: '📬', label: 'Package & errand runs', body: 'Grab a package, drop something off, handle a quick errand.' },
  { emoji: '💪', label: 'Labor & odd jobs', body: 'Heavy lifting, assembly help, or anything that takes an extra pair of hands.' },
  { emoji: '🤝', label: 'Quick paid favors', body: "Anything practical on campus. Post it — someone nearby can help." },
]

const TRUST = [
  {
    emoji: '🎓',
    label: '.edu verified',
    body: "Everyone joins with a university email. You're only ever talking to people on your actual campus.",
  },
  {
    emoji: '📍',
    label: 'Campus-scoped feed',
    body: 'You only see requests from your campus. No noise from other schools or cities.',
  },
  {
    emoji: '🚫',
    label: 'Strict scope guardrails',
    body: 'No dating, social posts, off-campus side-hustles, or inappropriate requests. Practical campus help only.',
  },
  {
    emoji: '🛡️',
    label: 'Safety tools',
    body: 'Block any user at any time. Admin oversight on every campus. Report tools built in.',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      <PageTracker event="landing_page_view" />

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-fade-up { animation: fadeUp 0.55s ease both; }
        .anim-delay-1 { animation-delay: 0.08s; }
        .anim-delay-2 { animation-delay: 0.18s; }
        .anim-delay-3 { animation-delay: 0.28s; }
        .anim-delay-4 { animation-delay: 0.38s; }
      `}</style>

      {/* ── Navbar ── */}
      <header
        data-testid="landing-navbar"
        className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-600 text-lg leading-none">⬡</span>
            <span className="font-bold text-[15px] tracking-tight text-slate-900">CampusOS</span>
          </div>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
              How it works
            </a>
            <a href="#safety" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
              Safety
            </a>
            <a href="#for-helpers" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
              For helpers
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              data-testid="nav-login-link"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              data-testid="nav-signup-link"
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        data-testid="landing-hero"
        className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 via-slate-50 to-white"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 70% 40% at 50% -10%, rgba(99,102,241,0.10), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-4xl px-5 pt-16 pb-12 sm:pt-24 sm:pb-16 text-center">
          <div className="anim-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-blue-700">Students helping students in real time</span>
          </div>

          <h1 className="anim-fade-up anim-delay-1 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight text-slate-900">
            Campus help in 30 seconds.
          </h1>

          <p className="anim-fade-up anim-delay-2 mx-auto mt-5 max-w-2xl text-base sm:text-lg text-slate-500 leading-relaxed">
            Post a ride, pickup, errand, moving help, or quick favor.
            Verified students nearby can offer, counter, and help.
          </p>

          <div className="anim-fade-up anim-delay-3 mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              data-testid="hero-signup-link"
              className="w-full sm:w-auto rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-md shadow-blue-200 hover:bg-blue-500 transition-all hover:shadow-lg hover:shadow-blue-200 active:scale-[0.98]"
            >
              Sign up — it&apos;s free
            </Link>
            <Link
              href="/login"
              data-testid="hero-login-link"
              className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-8 py-3 text-base font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-colors active:scale-[0.98]"
            >
              Log in
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">University email required · Free to join</p>

          <PWAInstallCTA />

          {/* Mock flow */}
          <div className="anim-fade-up anim-delay-4 mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <div className="w-full sm:w-52 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">🚗 Rides</span>
              </div>
              <p className="text-sm font-semibold text-slate-900 leading-snug">Need a ride to DFW Friday 9am</p>
              <p className="mt-1 text-[11px] text-slate-400">Split gas · 2 seats · flexible time</p>
              <div className="mt-2.5 text-[10px] font-semibold text-blue-600">Just posted ✦</div>
            </div>

            <div className="hidden sm:flex flex-col items-center gap-1">
              <div className="h-px w-8 bg-slate-200" />
              <span className="text-xs text-slate-400">offer</span>
            </div>
            <div className="sm:hidden text-slate-300 text-lg">↓</div>

            <div className="w-full sm:w-52 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-emerald-200 flex items-center justify-center text-[11px] font-semibold text-emerald-800">A</div>
                <span className="text-xs font-semibold text-slate-700">Alex · ★ 4.9</span>
              </div>
              <p className="text-sm font-semibold text-slate-900">Offered to drive</p>
              <p className="mt-1 text-[11px] text-slate-500">Split gas · Departs 8:45 AM</p>
              <div className="mt-2.5 text-[10px] font-semibold text-emerald-600">New offer ✓</div>
            </div>

            <div className="hidden sm:flex flex-col items-center gap-1">
              <div className="h-px w-8 bg-slate-200" />
              <span className="text-xs text-slate-400">accept</span>
            </div>
            <div className="sm:hidden text-slate-300 text-lg">↓</div>

            <div className="w-full sm:w-52 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left shadow-sm">
              <div className="mb-2 text-lg">🎉</div>
              <p className="text-sm font-semibold text-slate-900">Ride confirmed!</p>
              <p className="mt-1 text-[11px] text-slate-500">Coordinate over chat. Pay Alex directly after.</p>
              <div className="mt-2.5 text-[10px] font-semibold text-violet-600">Done in 2 minutes</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" data-testid="landing-how-it-works" className="bg-slate-50 border-y border-slate-100">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            The flow
          </p>
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
            How CampusOS works
          </h2>
          <p className="text-center text-sm text-slate-500 mb-12">
            From stuck to sorted in seconds.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.n}
                className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                    {step.n}
                  </div>
                  <span className="text-lg leading-none">{step.emoji}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What students use it for ── */}
      <section data-testid="landing-categories" className="bg-white">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Categories
          </p>
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
            What students use it for
          </h2>
          <p className="text-center text-sm text-slate-500 mb-12">
            Anything practical that comes up in student life.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.label}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 hover:border-blue-200 hover:bg-blue-50/30 transition-all"
              >
                <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{cat.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-0.5">{cat.label}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{cat.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Earn by helping ── */}
      <section id="for-helpers" data-testid="landing-for-helpers" className="border-y border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50/50">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
          <div className="rounded-2xl border border-emerald-200 bg-white px-8 py-10 sm:py-12 text-center shadow-sm">
            <span className="text-4xl mb-4 block">💪</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              Earn by helping
            </h2>
            <p className="mx-auto max-w-xl text-base text-slate-500 leading-relaxed mb-6">
              Have a car? A free hour? Strong arms? Browse open requests from students near you
              and offer to help. Set your own price, accept what works.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {[
                '🚗 Drive someone to the airport',
                '📦 Help with a dorm move',
                '📚 Tutor a classmate',
                '🛒 Do a quick grocery run',
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-800"
                >
                  {item}
                </span>
              ))}
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white hover:bg-emerald-500 transition-colors shadow-md shadow-emerald-200"
            >
              Start helping around campus →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust and safety ── */}
      <section id="safety" data-testid="landing-safety" className="bg-white">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Trust &amp; safety
          </p>
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
            Built for trust on campus
          </h2>
          <p className="text-center text-sm text-slate-500 mb-12">
            Everyone uses a university email. You decide who to work with.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TRUST.map((t) => (
              <div
                key={t.label}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 hover:border-blue-200 transition-colors"
              >
                <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{t.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-1">{t.label}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{t.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <p className="text-sm text-amber-800 leading-relaxed">
              <span className="font-semibold">Not for social or off-topic posts.</span>{' '}
              CampusOS is for practical campus help only — no dating, side-hustle pitches,
              advertising, or off-scope requests. Posts are reviewed by campus admins.
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section data-testid="landing-final-cta" className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-blue-50/50">
        <div className="mx-auto max-w-2xl px-5 py-20 sm:py-24 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
            Ready to get help or earn around campus?
          </h2>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            Join your campus community. Post a request in 30 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              data-testid="cta-signup-link"
              className="w-full sm:w-auto rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-md shadow-blue-200 hover:bg-blue-500 transition-all active:scale-[0.98]"
            >
              Create account
            </Link>
            <Link
              href="/login"
              data-testid="cta-login-link"
              className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-8 py-3 text-base font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-colors"
            >
              Log in
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">University email required · Free to join</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-blue-600 leading-none">⬡</span>
            <div>
              <span className="text-sm font-semibold text-slate-900">CampusOS</span>
              <span className="ml-2 text-xs text-slate-400">Practical help from verified students.</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs text-slate-400">
            <Link href="/terms"      className="hover:text-slate-700 transition-colors">Terms</Link>
            <Link href="/privacy"    className="hover:text-slate-700 transition-colors">Privacy</Link>
            <Link href="/guidelines" className="hover:text-slate-700 transition-colors">Guidelines</Link>
            <Link href="/safety"     className="hover:text-slate-700 transition-colors">Safety</Link>
            <Link href="/support"    className="hover:text-slate-700 transition-colors">Support</Link>
            <a href="mailto:campusosapp@gmail.com" className="hover:text-slate-700 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
