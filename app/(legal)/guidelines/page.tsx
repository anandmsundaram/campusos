import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Community Guidelines — CampusOS',
}

function Rule({
  emoji,
  title,
  children,
}: {
  emoji: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-4">
      <span className="text-xl leading-none mt-0.5 flex-shrink-0">{emoji}</span>
      <div>
        <p className="text-sm font-semibold text-white mb-1">{title}</p>
        <p className="text-sm text-slate-400 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

function Prohibited({
  emoji,
  title,
  children,
}: {
  emoji: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-red-500/15 bg-red-500/[0.04] px-5 py-4">
      <span className="text-xl leading-none mt-0.5 flex-shrink-0">{emoji}</span>
      <div>
        <p className="text-sm font-semibold text-white mb-1">{title}</p>
        <p className="text-sm text-slate-400 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

export default function GuidelinesPage() {
  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Community Guidelines</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: May 21, 2026</p>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed mb-10">
        CampusOS works because students treat each other with basic respect and honesty.
        These guidelines exist to keep it that way. They apply to everything you post,
        offer, message, and do through the platform.
      </p>

      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-4">
        How we expect you to act
      </h2>
      <div className="flex flex-col gap-3 mb-12">
        <Rule emoji="🤝" title="Be respectful">
          Treat every student the way you would want to be treated. Disagreements happen —
          handle them like an adult. Abusive, threatening, or discriminatory language of any
          kind is not acceptable and will result in account suspension.
        </Rule>

        <Rule emoji="✅" title="Be honest">
          Post requests and offers that are accurate. Don't misrepresent what you need,
          what you're offering, your price, your availability, or your qualifications.
          If something changes, communicate it directly.
        </Rule>

        <Rule emoji="📅" title="Follow through">
          If you accept an offer or confirm a request, show up. A culture of reliability
          is what makes this platform useful. Repeated no-shows or cancellations may
          result in your account being suspended.
        </Rule>

        <Rule emoji="💬" title="Keep it on-platform until you've connected">
          Use CampusOS to coordinate — then move to whatever communication method works
          for you. Don't post personal contact info publicly in request descriptions.
        </Rule>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-widest text-red-400/70 mb-4">
        What is not allowed
      </h2>
      <div className="flex flex-col gap-3 mb-12">
        <Prohibited emoji="🚫" title="Harassment and threatening behavior">
          No harassment, threats, stalking, discrimination, or any behavior intended to
          intimidate or harm another person. This includes behavior in messages, request
          descriptions, and offer text.
        </Prohibited>

        <Prohibited emoji="💸" title="Scams and fraud">
          No fake requests, fake offers, or attempts to extract money, personal information,
          or favors through deception. This includes bait-and-switch pricing and requests
          designed to mislead.
        </Prohibited>

        <Prohibited emoji="🔞" title="Adult and sexual services">
          No adult content, sexual services, escort services, or anything of a sexual nature.
          Zero tolerance — immediate permanent ban.
        </Prohibited>

        <Prohibited emoji="📝" title="Academic dishonesty services">
          No requests or offers to write papers, complete assignments, take exams, or perform
          any academic work that misrepresents someone else as the author. This violates
          your university's honor code and ours.
        </Prohibited>

        <Prohibited emoji="⚠️" title="Illegal activity">
          No requests or offers involving anything illegal — including but not limited to
          controlled substances, illegal transportation, unlicensed services, or stolen goods.
        </Prohibited>

        <Prohibited emoji="🔫" title="Dangerous requests">
          No requests involving weapons, dangerous materials, or activities that could result
          in physical harm to any person.
        </Prohibited>
      </div>

      <h2 className="text-base font-semibold text-white mb-4">Enforcement</h2>
      <div className="space-y-3 text-sm text-slate-400 leading-relaxed">
        <p>
          We review reports from users and take action based on severity:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-slate-300">Warning</strong> — for first-time minor violations</li>
          <li><strong className="text-slate-300">Temporary suspension</strong> — for repeated or more serious violations</li>
          <li><strong className="text-slate-300">Permanent ban</strong> — for severe violations (harassment, scams, adult content, illegal activity)</li>
        </ul>
        <p>
          CampusOS reserves the right to act without warning for serious violations.
          If you believe you were actioned unfairly, email us at{' '}
          <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>.
        </p>
      </div>

      <div className="mt-10 rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-4">
        <p className="text-sm font-medium text-white mb-1">See something wrong?</p>
        <p className="text-sm text-slate-400 leading-relaxed">
          Use the Report button on any request, offer, or conversation to flag content that
          violates these guidelines. Reports are reviewed by the CampusOS team.
          You can also email{' '}
          <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>{' '}
          for urgent safety concerns.
        </p>
      </div>
    </>
  )
}
