import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Support — CampusOS',
}

export default function SupportPage() {
  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Support</h1>
        <p className="mt-2 text-sm text-slate-500">We&apos;re here to help.</p>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed mb-10">
        CampusOS is a small team building a student marketplace. If you have a question,
        safety concern, or account issue, email us and we will get back to you promptly.
      </p>

      {/* Contact */}
      <section className="mb-10 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-6 py-6">
        <h2 className="text-base font-semibold text-white mb-2">Contact us</h2>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">
          For account questions, safety reports, privacy requests, or marketplace issues:
        </p>
        <a
          href="mailto:campusosapp@gmail.com"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          campusosapp@gmail.com
        </a>
        <p className="mt-3 text-xs text-slate-600">We aim to respond within 48 hours.</p>
      </section>

      {/* Common topics */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-white mb-4">Common topics</h2>
        <div className="flex flex-col gap-3">
          {[
            {
              emoji: '🗑️',
              title: 'Delete my account',
              body: 'Sign in, go to your Profile page, scroll to the Danger Zone section, and use the Delete Account button. If you need help, email us.',
            },
            {
              emoji: '🔒',
              title: 'Privacy and data requests',
              body: 'To request a copy of your data or ask about how your data is used, email us with the subject "Data Request".',
            },
            {
              emoji: '🚩',
              title: 'Report a safety concern',
              body: 'Use the Report button on any request, offer, or conversation inside the app. For urgent concerns, email us directly.',
            },
            {
              emoji: '🔑',
              title: 'Account or login issues',
              body: 'Try the Forgot Password flow on the login page. If that does not work, email us with your university email address.',
            },
            {
              emoji: '🤝',
              title: 'Dispute with another user',
              body: 'CampusOS does not mediate disputes between students. Use the Block and Report tools in the app, and contact your campus safety office if needed.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-4 rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-4"
            >
              <span className="text-xl leading-none mt-0.5 flex-shrink-0">{item.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-white mb-1">{item.title}</p>
                <p className="text-sm text-slate-400 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Links */}
      <section>
        <h2 className="text-base font-semibold text-white mb-4">Useful links</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { href: '/safety',     label: 'Safety guide' },
            { href: '/guidelines', label: 'Community Guidelines' },
            { href: '/privacy',    label: 'Privacy Policy' },
            { href: '/terms',      label: 'Terms of Service' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-[#1e2d4a] bg-[#0d1526] px-4 py-2 text-sm text-slate-300 hover:border-blue-500/30 hover:text-blue-300 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
