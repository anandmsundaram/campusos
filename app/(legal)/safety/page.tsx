import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Safety — CampusOS',
}

function Tip({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-xl leading-none mt-0.5 flex-shrink-0">{emoji}</span>
      <div>
        <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
        <p className="text-sm text-slate-400 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

export default function SafetyPage() {
  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Safety</h1>
        <p className="mt-2 text-sm text-slate-500">For students coordinating through CampusOS</p>
      </div>

      {/* Platform disclaimer */}
      <div className="mb-12 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-5 py-5">
        <p className="text-sm font-semibold text-amber-400 mb-2">Important — read this first</p>
        <p className="text-sm text-slate-400 leading-relaxed">
          CampusOS is a coordination platform. We connect students with each other — we do not
          provide transportation, moving services, tutoring, or any other service directly.
          We do not vet, screen, or background-check any user beyond verifying a university
          email address. We do not provide insurance for any activity arranged through the platform.
          You are responsible for your own safety. Use your judgment.
        </p>
      </div>

      {/* General safety */}
      <section className="mb-12">
        <h2 className="text-base font-semibold text-white mb-5">General tips</h2>
        <div className="flex flex-col gap-5">
          <Tip emoji="📍" title="Meet in public for first contact">
            For in-person exchanges, meet initially in a busy, well-lit campus location — the student
            union, library entrance, or a dining hall. Avoid meeting in private or unfamiliar places
            you're not comfortable with.
          </Tip>
          <Tip emoji="📱" title="Tell someone where you're going">
            Share your plans with a friend — who you're meeting, where, and when you expect to be back.
            This is especially important for rides and moving help.
          </Tip>
          <Tip emoji="🔍" title="Check profiles before committing">
            Look at the other student's rating, completed tasks, and profile before accepting an offer
            or accepting someone into your car. A history of completed interactions is a good signal.
          </Tip>
          <Tip emoji="💬" title="Coordinate directly in chat">
            Use the messaging feature to confirm specific details — exact pickup location, price,
            timing — before anything happens. Don't assume the other person understood everything.
          </Tip>
          <Tip emoji="🧠" title="Trust your instincts">
            If something feels off — the price seems too good, the request seems unusual, the person
            seems evasive — trust that feeling. It's okay to cancel and walk away.
          </Tip>
        </div>
      </section>

      {/* Rides safety */}
      <section className="mb-12">
        <h2 className="text-base font-semibold text-white mb-2">Rides — extra care required</h2>
        <p className="text-sm text-slate-500 mb-5">
          Rides involve physical travel in another person's vehicle. Take these seriously.
        </p>

        <div className="rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-5 mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-400/70 mb-3">
            What CampusOS does NOT do for rides
          </p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2"><span className="text-red-400 flex-shrink-0 mt-0.5">✗</span> We do not vet or background-check drivers</li>
            <li className="flex items-start gap-2"><span className="text-red-400 flex-shrink-0 mt-0.5">✗</span> We do not verify driver's licenses or driving records</li>
            <li className="flex items-start gap-2"><span className="text-red-400 flex-shrink-0 mt-0.5">✗</span> We do not inspect or verify vehicles</li>
            <li className="flex items-start gap-2"><span className="text-red-400 flex-shrink-0 mt-0.5">✗</span> We do not provide any insurance for rides arranged through the platform</li>
            <li className="flex items-start gap-2"><span className="text-red-400 flex-shrink-0 mt-0.5">✗</span> We are not a transportation company or rideshare service</li>
          </ul>
        </div>

        <div className="flex flex-col gap-5">
          <Tip emoji="🚗" title="Verify before you get in">
            Confirm the driver's name matches their CampusOS profile, the vehicle description matches
            what they described in chat, and you feel comfortable before getting in.
            Don't get into a vehicle if anything seems off.
          </Tip>
          <Tip emoji="📲" title="Share your trip">
            Before getting into a stranger's car, share your location with a friend. Many phones
            have a built-in "Share My Location" feature. Use it.
          </Tip>
          <Tip emoji="🛡️" title="Insurance is between you and your driver">
            If you are a driver: confirm whether your personal auto insurance covers passengers
            in informal arrangements. Many standard policies do not. Consider a commercial rider
            or rideshare endorsement if you plan to offer rides regularly.
          </Tip>
          <Tip emoji="💵" title="Agree on price before the ride">
            Confirm the price and payment method in chat before the ride starts. Don't leave
            payment ambiguous — it causes disputes.
          </Tip>
        </div>
      </section>

      {/* Emergency */}
      <section className="mb-12">
        <h2 className="text-base font-semibold text-white mb-5">In an emergency</h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-5 py-5">
          <p className="text-sm text-slate-400 leading-relaxed">
            <strong className="text-white">Call 911</strong> if you are in immediate danger or witness
            a crime. CampusOS is not an emergency service and cannot help you in real time.
            After ensuring your safety, report the incident to your campus safety office and
            email us at{' '}
            <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>{' '}
            so we can take action on the account.
          </p>
        </div>
      </section>

      {/* Report */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">Reporting safety concerns</h2>
        <p className="text-sm text-slate-400 leading-relaxed mb-4">
          Use the Report button on any request, offer, or conversation to flag safety concerns.
          Reports are reviewed by the CampusOS team and help keep the community safe.
          For urgent concerns, email{' '}
          <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>{' '}
          directly.
        </p>
        <Link
          href="/guidelines"
          className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Read the Community Guidelines →
        </Link>
      </section>
    </>
  )
}
