import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — CampusOS',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-slate-400 leading-relaxed">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: May 21, 2026</p>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed">
        These Terms of Service govern your use of CampusOS. By creating an account or using the platform
        you agree to these terms. Please read them — they are written in plain language on purpose.
      </p>

      <Section title="1. What CampusOS is">
        <p>
          CampusOS is a peer-to-peer coordination platform. We help students find each other to arrange
          rides, moving help, tutoring, errands, borrowing, and other campus-related activities.
        </p>
        <p>
          CampusOS is <strong className="text-slate-300">not</strong> a transportation company,
          moving company, tutoring service, errand service, or any other type of service provider.
          We do not employ drivers, tutors, movers, or helpers. We do not provide any of these services
          ourselves. We are the platform that lets students coordinate with each other.
        </p>
        <p>
          Think of us as a bulletin board, not an agency. Students post what they need;
          other students respond and offer to help. What happens next is between them.
        </p>
      </Section>

      <Section title="2. Who can use CampusOS">
        <p>
          To use CampusOS you must be a currently enrolled university student (or affiliated faculty/staff)
          with access to a valid university email address. You must be at least 18 years old, or the age
          of majority in your jurisdiction if higher.
        </p>
        <p>
          By signing up you confirm that the information you provide — your name, university, major,
          and year — is accurate and not misleading.
        </p>
      </Section>

      <Section title="3. Your relationship with other users">
        <p>
          When you use CampusOS to coordinate a ride, tutoring session, errand, or any other activity,
          you are entering into an agreement with another individual student — not with CampusOS.
        </p>
        <p>
          You are fully responsible for the commitments you make on the platform, the quality of the
          service you provide, and your own conduct before, during, and after any coordinated activity.
        </p>
        <p>
          If something goes wrong between you and another user — a no-show, a dispute over payment,
          a service quality issue — that is between you and the other user. CampusOS does not mediate
          disputes, process refunds, or guarantee outcomes.
        </p>
      </Section>

      <Section title="4. Payments">
        <p>
          CampusOS does not process, hold, guarantee, or facilitate payments of any kind.
          All payments happen directly between students, outside of the platform — via Venmo, Zelle,
          cash, or any other method you agree on.
        </p>
        <p>
          The prices and budgets shown on CampusOS are for coordination purposes only.
          CampusOS makes no representation that any stated price is fair, reasonable, or what will
          actually be exchanged.
        </p>
      </Section>

      <Section title="5. Rides — important">
        <p>
          If you offer or accept a ride through CampusOS, you are arranging a ride with another
          individual student operating their own personal vehicle. This is not a rideshare service.
          CampusOS does not vet, screen, or license drivers. CampusOS does not provide insurance
          for any ride arranged through the platform.
        </p>
        <p>
          If you are a driver: you are responsible for ensuring your vehicle is legally registered,
          that you hold a valid license, and that you understand whether your personal auto insurance
          covers passengers in peer-to-peer arrangements. Many standard auto insurance policies do not.
        </p>
        <p>
          If you are a passenger: you ride at your own risk. Always confirm the driver's identity,
          vehicle, and details before getting in. Read our <a href="/safety" className="text-blue-400 hover:underline">Safety page</a> before your first ride.
        </p>
      </Section>

      <Section title="6. Identity and verification">
        <p>
          CampusOS verifies that you have access to a university email address. We do not verify
          your legal identity, run background checks, verify your enrollment status, or confirm
          any other claims you make on your profile.
        </p>
        <p>
          The ".edu verified" badge means only that a university email address was used to sign up.
          It is not a guarantee of identity, trustworthiness, or background.
        </p>
      </Section>

      <Section title="7. Prohibited conduct">
        <p>You agree not to use CampusOS for:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Illegal activity of any kind</li>
          <li>Harassment, threats, discrimination, or abusive behavior toward other users</li>
          <li>Scams, fraud, or misrepresentation</li>
          <li>Adult, sexual, or escort services</li>
          <li>Facilitating academic dishonesty — writing papers, completing assignments, or taking exams for other students</li>
          <li>Transporting, delivering, or obtaining illegal substances</li>
          <li>Anything involving weapons, dangerous materials, or activities that could cause physical harm</li>
          <li>Impersonating another person or creating a misleading profile</li>
          <li>Posting fake requests or offers to manipulate other users</li>
          <li>Circumventing or misusing the platform's matching or trust systems</li>
        </ul>
        <p>
          Violations may result in immediate account suspension or permanent termination,
          at CampusOS's sole discretion.
        </p>
      </Section>

      <Section title="8. Account termination">
        <p>
          CampusOS reserves the right to suspend or terminate your account at any time, for any reason,
          with or without notice. Reasons may include violations of these terms, community guidelines,
          reports from other users, or any conduct we determine to be harmful to the platform or its users.
        </p>
        <p>
          You may delete your own account at any time by contacting us at{' '}
          <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>.
        </p>
      </Section>

      <Section title="9. No guarantees">
        <p>
          CampusOS is provided "as is." We do not guarantee that the platform will always be available,
          that users will be who they say they are, that services arranged through the platform will
          be completed, or that your experience will be safe or satisfactory.
        </p>
        <p>
          We do our best to build a trustworthy community. But ultimately you are interacting with
          other individuals, and you should exercise your own judgment and take reasonable precautions.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the fullest extent permitted by law, CampusOS, its founders, employees, and agents shall
          not be liable for any damages arising from your use of the platform, any interaction with
          another user, any ride, service, or transaction arranged through the platform, or any
          unauthorized access to your account.
        </p>
        <p>
          If you have a dispute with another user, you release CampusOS from all claims arising
          from that dispute.
        </p>
      </Section>

      <Section title="11. Changes to these terms">
        <p>
          We may update these terms from time to time. When we do, we will update the date at the top
          of this page. Continued use of CampusOS after changes constitutes acceptance of the updated terms.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these terms? Email us at{' '}
          <a href="mailto:campusosapp@gmail.com" className="text-blue-400 hover:underline">campusosapp@gmail.com</a>.
        </p>
      </Section>

      <div className="mt-12 rounded-xl border border-[#1e2d4a] bg-[#0d1526] px-5 py-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Note:</strong> These terms are designed for a private beta
          and have not been reviewed by a lawyer. If you are a legal professional and spot something
          important, we would appreciate a heads-up at campusosapp@gmail.com.
        </p>
      </div>
    </>
  )
}
